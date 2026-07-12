import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ICN } from '../../../icons';
import { StatusPill, when } from '../adminStatus.jsx';
import {
  getAdminTicket,
  listAdminTickets,
  markAdminTicketSeen,
  replyAdminTicket,
  updateAdminTicket,
} from '../../../api/adminTickets.js';

const STATUSES = ['open', 'pending_admin', 'pending_customer', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

function timeAgo(value) {
  if (!value) return '';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function clientLabel(ticket) {
  return ticket?.user?.clientId || ticket?.userId?.slice(0, 12) || 'unknown';
}

function TicketBubble({ message }) {
  const isAdmin = message.senderRole === 'admin';
  return (
    <div className={`support-message ${isAdmin ? 'support-message--admin' : 'support-message--customer'} admin-ticket-message`}>
      <div className="support-message-meta">
        <span className="support-message-sender">{isAdmin ? 'Admin' : 'Customer'}</span>
        <span className="support-message-time">{timeAgo(message.createdAt)}</span>
      </div>
      <div className="support-message-body">{message.body}</div>
      <div className={`support-message-status support-message-status--${message.status || 'sent'}`}>
        {message.status || 'sent'}
      </div>
    </div>
  );
}

export function AdminTicketsSection({ onUnreadChange }) {
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const scrollRef = useRef(null);

  const refresh = useCallback(async (keepSelection = true) => {
    setError('');
    try {
      const result = await listAdminTickets({ status: statusFilter || undefined, limit: 100 });
      const items = result?.items ?? [];
      setTickets(items);
      onUnreadChange?.(items.reduce((sum, t) => sum + (Number(t.unreadForAdmin) || 0), 0));
      if (!keepSelection || (selectedId && !items.some((t) => t.id === selectedId))) {
        setSelectedId(items[0]?.id || null);
      } else if (!selectedId && items.length) {
        setSelectedId(items[0].id);
      }
    } catch (err) {
      setError(err.message || 'Could not load tickets.');
    } finally {
      setLoading(false);
    }
  }, [onUnreadChange, selectedId, statusFilter]);

  const loadThread = useCallback(async (ticketId, quiet = false) => {
    if (!ticketId) { setThread(null); return; }
    if (!quiet) setThreadLoading(true);
    try {
      const ticket = await getAdminTicket(ticketId);
      setThread(ticket);
      if (ticket.unreadForAdmin > 0 || ticket.messages?.some((m) => m.senderRole === 'customer' && m.status === 'sent')) {
        await markAdminTicketSeen(ticketId).catch(() => null);
        setTickets((prev) => prev.map((t) => (t.id === ticketId ? { ...t, unreadForAdmin: 0 } : t)));
        onUnreadChange?.(tickets.reduce((sum, t) => sum + (t.id === ticketId ? 0 : Number(t.unreadForAdmin) || 0), 0));
      }
    } catch (err) {
      if (!quiet) setError(err.message || 'Could not load ticket conversation.');
    } finally {
      if (!quiet) setThreadLoading(false);
    }
  }, [onUnreadChange, tickets]);

  useEffect(() => { refresh(false); }, [statusFilter]);
  useEffect(() => { if (selectedId) loadThread(selectedId); }, [selectedId]);
  useEffect(() => {
    const t = setInterval(() => refresh(true), 45000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread?.messages?.length, selectedId]);

  const reply = async () => {
    const body = draft.trim();
    if (!body || !selectedId || busy) return;
    setBusy('reply'); setError(''); setNotice('');
    try {
      await replyAdminTicket(selectedId, body);
      setDraft('');
      setNotice('Reply sent.');
      await Promise.all([loadThread(selectedId, true), refresh(true)]);
    } catch (err) {
      setError(err.message || 'Reply failed.');
    } finally {
      setBusy('');
    }
  };

  const updateTicket = async (patch, label) => {
    if (!selectedId || busy) return;
    setBusy(label); setError(''); setNotice('');
    try {
      await updateAdminTicket(selectedId, patch);
      setNotice(`${label} updated.`);
      await Promise.all([loadThread(selectedId, true), refresh(true)]);
    } catch (err) {
      setError(err.message || `${label} failed.`);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="admin-tickets-section">
      <div className="admin-ticket-toolbar">
        <div>
          <h2>Tickets and messages</h2>
          <p className="muted">Support conversations linked to client IDs, message state, and notifications.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: 170 }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn btn-outline" onClick={() => refresh(true)} disabled={loading}>
            <ICN.Refresh size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="card admin-ticket-alert danger">{error}</div>}
      {notice && <div className="card admin-ticket-alert success">{notice}</div>}

      <div className="admin-ticket-layout">
        <div className="card admin-ticket-table-wrap">
          <table className="tbl admin-ticket-table">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Client ID</th>
                <th>Subject</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Last message</th>
                <th>Updated</th>
                <th>Unread</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="8" className="muted">Loading tickets...</td></tr>}
              {!loading && tickets.length === 0 && <tr><td colSpan="8" className="muted">No tickets yet.</td></tr>}
              {tickets.map((ticket) => (
                <tr key={ticket.id} className={ticket.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(ticket.id)}>
                  <td className="mono">{ticket.id.slice(0, 8)}</td>
                  <td>
                    <div className="admin-ticket-client">{clientLabel(ticket)}</div>
                    <div className="muted">{ticket.user?.email || ticket.userId?.slice(0, 10)}</div>
                  </td>
                  <td>
                    <div className="admin-ticket-subject">{ticket.subject}</div>
                    <div className="muted">{ticket.category}</div>
                  </td>
                  <td><StatusPill value={ticket.status} /></td>
                  <td><StatusPill value={ticket.priority} /></td>
                  <td className="admin-ticket-last">
                    {ticket.lastMessage ? `${ticket.lastMessage.senderRole === 'admin' ? 'Admin' : 'Customer'}: ${ticket.lastMessage.body}` : 'No message'}
                  </td>
                  <td>{timeAgo(ticket.lastMessageAt || ticket.updatedAt || ticket.createdAt)}</td>
                  <td>{ticket.unreadForAdmin > 0 ? <span className="support-unread-badge">{ticket.unreadForAdmin}</span> : <span className="muted">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="card admin-ticket-panel">
          {!selectedId ? (
            <div className="support-thread-empty"><ICN.MessageSquare size={28} /><span>Select a ticket</span></div>
          ) : threadLoading && !thread ? (
            <div className="support-thread-empty"><ICN.MessageSquare size={28} /><span>Loading conversation...</span></div>
          ) : thread ? (
            <>
              <div className="admin-ticket-panel-head">
                <div>
                  <h3>{thread.subject}</h3>
                  <p className="muted">
                    {clientLabel(thread)} · {thread.userId?.slice(0, 12) || 'no user'} · opened {when(thread.createdAt)}
                  </p>
                </div>
                <StatusPill value={thread.status} />
              </div>

              <div className="admin-ticket-controls">
                <select className="input" value={thread.status} onChange={(e) => updateTicket({ status: e.target.value }, 'Status')}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="input" value={thread.priority} onChange={(e) => updateTicket({ priority: e.target.value }, 'Priority')}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className="support-thread-scroll admin-ticket-scroll" ref={scrollRef}>
                {(thread.messages ?? []).map((message) => <TicketBubble key={message.id} message={message} />)}
              </div>

              <div className="support-composer admin-ticket-composer">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); reply(); } }}
                  placeholder={thread.status === 'closed' ? 'This ticket is closed.' : 'Reply as Glondia Support...'}
                  disabled={busy === 'reply' || thread.status === 'closed'}
                  rows={3}
                />
                <button className="btn btn-primary" onClick={reply} disabled={busy === 'reply' || thread.status === 'closed' || !draft.trim()}>
                  {busy === 'reply' ? 'Sending...' : <><ICN.Send size={14} /> Reply</>}
                </button>
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

export default AdminTicketsSection;
