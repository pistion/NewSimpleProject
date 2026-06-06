import { Bell, CircleHelp, Mail, Menu, Search, UserCircle2 } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { activeProject, messages, notifications } from '../../data/dashboardMockData.js'
import { dashboardRouteLabels } from './DashboardSidebar.jsx'
import ProjectSelector from './ProjectSelector.jsx'

function getBreadcrumbs(pathname) {
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length <= 1) {
    return [{ label: 'Overview', to: '/dashboard' }]
  }

  const crumbs = [{ label: 'Dashboard', to: '/dashboard' }]
  const currentPath = []

  segments.forEach((segment, index) => {
    currentPath.push(segment)
    if (segment === 'dashboard') {
      return
    }

    const fullPath = `/${currentPath.join('/')}`
    const label =
      dashboardRouteLabels[fullPath] ||
      (segment === activeProject.id ? activeProject.name : segment.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()))

    crumbs.push({
      label,
      to: index === segments.length - 1 ? null : fullPath,
    })
  })

  return crumbs
}

export default function DashboardTopbar() {
  const location = useLocation()
  const breadcrumbs = getBreadcrumbs(location.pathname)

  return (
    <header className="dashboard-topbar border-bottom bg-white sticky-top">
      <div className="container-fluid py-3">
        <div className="d-flex flex-column gap-3">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
            <div className="d-flex align-items-center gap-2">
              <button
                aria-controls="dashboardSidebarCanvas"
                aria-label="Open navigation"
                className="btn btn-outline-secondary d-lg-none"
                data-bs-target="#dashboardSidebarCanvas"
                data-bs-toggle="offcanvas"
                type="button"
              >
                <Menu size={18} />
              </button>
              <ProjectSelector />
            </div>
            <div className="dashboard-search-wrapper">
              <div className="input-group">
                <span className="input-group-text bg-transparent"><Search size={16} /></span>
                <input
                  aria-label="Search pages, products, tickets, settings"
                  className="form-control"
                  placeholder="Search pages, products, tickets, settings"
                />
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <div className="dropdown">
                <button className="btn btn-outline-secondary position-relative" data-bs-toggle="dropdown" type="button">
                  <Mail size={18} />
                  <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-success">
                    {messages.filter((message) => message.unread).length}
                  </span>
                </button>
                <div className="dropdown-menu dropdown-menu-end p-0 shadow-sm message-menu">
                  <div className="p-3 border-bottom fw-semibold">Messages</div>
                  {messages.slice(0, 3).map((message) => (
                    <Link className="dropdown-item py-3" key={message.id} to="/dashboard/messages">
                      <div className="d-flex justify-content-between gap-3">
                        <div>
                          <div className="fw-medium">{message.subject}</div>
                          <div className="small text-secondary">{message.preview}</div>
                        </div>
                        <small className="text-secondary">{message.time}</small>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="dropdown">
                <button className="btn btn-outline-secondary position-relative" data-bs-toggle="dropdown" type="button">
                  <Bell size={18} />
                  <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill text-bg-success">
                    {notifications.length}
                  </span>
                </button>
                <div className="dropdown-menu dropdown-menu-end p-0 shadow-sm message-menu">
                  <div className="p-3 border-bottom fw-semibold">Notifications</div>
                  {notifications.map((item) => (
                    <div className="dropdown-item py-3" key={item.id}>
                      <div className="fw-medium">{item.title}</div>
                      <div className="small text-secondary">{item.detail}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="dropdown">
                <button className="btn btn-outline-secondary" data-bs-toggle="dropdown" type="button">
                  <CircleHelp size={18} />
                </button>
                <ul className="dropdown-menu dropdown-menu-end shadow-sm">
                  <li><Link className="dropdown-item" to="/support">Support center</Link></li>
                  <li><Link className="dropdown-item" to="/dashboard/tickets">Open ticket</Link></li>
                </ul>
              </div>

              <div className="dropdown">
                <button
                  className="btn topbar-account-btn d-flex align-items-center gap-2"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                  type="button"
                >
                  <div className="topbar-account-avatar">
                    <UserCircle2 size={20} />
                  </div>
                  <div className="topbar-account-info d-none d-md-flex flex-column align-items-start">
                    <span className="topbar-account-name">My Account</span>
                    <span className="topbar-account-role">Admin</span>
                  </div>
                </button>
                <div className="dropdown-menu dropdown-menu-end topbar-account-menu shadow">
                  <div className="topbar-account-menu-header">
                    <div className="topbar-account-menu-avatar">
                      <UserCircle2 size={36} />
                    </div>
                    <div>
                      <div className="topbar-account-menu-name">My Account</div>
                      <div className="topbar-account-menu-email">admin@glondia.com</div>
                    </div>
                  </div>
                  <div className="dropdown-divider my-0" />
                  <Link className="dropdown-item topbar-account-menu-item" to="/dashboard/account">
                    Profile &amp; Details
                  </Link>
                  <Link className="dropdown-item topbar-account-menu-item" to="/dashboard/settings">
                    Settings
                  </Link>
                  <Link className="dropdown-item topbar-account-menu-item" to="/dashboard/billing">
                    Billing
                  </Link>
                  <div className="dropdown-divider my-0" />
                  <Link className="dropdown-item topbar-account-menu-item topbar-account-menu-signout" to="/logout">
                    Sign out
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <nav aria-label="breadcrumb">
            <ol className="breadcrumb small mb-0">
              {breadcrumbs.map((crumb, index) => (
                <li
                  className={`breadcrumb-item ${index === breadcrumbs.length - 1 ? 'active' : ''}`}
                  key={`${crumb.label}-${index}`}
                >
                  {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label}
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>
    </header>
  )
}
