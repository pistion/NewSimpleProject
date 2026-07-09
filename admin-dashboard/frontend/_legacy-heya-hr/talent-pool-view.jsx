/* Client-side fallback search: flattens every searchable talent field into one
   lowercase string. Mirrors src/services/talent-search/record-indexer so the UI
   still searches all data if the server endpoint is unavailable. */
function talentSearchHaystack(t) {
  if (!t) return "";
  const submissionValues = (t.submissions || t.duplicateSubmissions || []).flatMap((s) => [
    s.name, s.fullName, s.headline, s.desiredRoles, s.location,
    s.email, s.phone, s.keySkills, s.industries,
    s.notes, s.additionalNotes, s.coverLetterText,
    s.yearsExperienceLabel, s.source, s.submissionCode, s.submissionUid,
    s.cvFile?.name, s.coverLetterFile?.name,
    ...(s.skills || []), ...(s.tags || [])
  ]);
  const values = [
    t.name, t.fullName, t.title, t.headline, t.desiredRoles, t.location,
    t.preferredWorkLocation, t.email, t.normalizedEmail, t.phone, t.education,
    t.highestQualification, t.keySkills, t.industries, t.availability, t.status,
    t.notes, t.additionalNotes, t.coverLetterText, t.summary,
    t.yearsExperienceLabel, t.source, t.submissionCode, t.cvName, t.coverLetterName,
    ...(t.skills || []), ...(t.tags || []), ...submissionValues
  ];
  return values.filter(Boolean).join("  ").toLowerCase();
}

// Build a normalized submissions array from a talent object (frontend fallback if backend hasn't populated it)
function buildSubmissions(talent) {
  if (Array.isArray(talent.submissions) && talent.submissions.length > 0) {
    return talent.submissions.filter(Boolean);
  }
  const primary = {
    id: talent.id, submissionUid: talent.submissionCode || `TAL-${talent.id}`,
    submissionCode: talent.submissionCode || null, applicantId: talent.applicantId,
    submissionIndex: 1, duplicateStatus: "primary", isPrimary: true,
    name: talent.name || "", email: talent.email || "", phone: talent.phone || "",
    location: talent.location || "", desiredRoles: talent.desiredRoles || "",
    industries: talent.industries || "", keySkills: talent.keySkills || "",
    yearsExperienceLabel: talent.yearsExperienceLabel || "",
    headline: talent.headline || talent.notes || "", notes: talent.notes || "",
    coverLetterText: talent.coverLetterText || "", additionalNotes: talent.additionalNotes || "",
    cvFile: talent.cvFile || null, coverLetterFile: talent.coverLetterFile || null,
    idPhotoFile: talent.idPhotoFile || null,
    createdAt: talent.createdAt || null, updatedAt: talent.updatedAt || null,
    source: talent.source || "Talent Pool",
  };
  const dups = (talent.duplicateSubmissions || []).map((dup, i) => ({
    id: dup.id, submissionUid: dup.submissionCode || `TAL-${dup.id}`,
    submissionCode: dup.submissionCode || null, applicantId: dup.applicantId || talent.applicantId,
    submissionIndex: i + 2, duplicateStatus: "duplicate", isPrimary: false,
    name: dup.name || "", email: dup.email || "", phone: dup.phone || "",
    location: dup.location || "", desiredRoles: dup.desiredRoles || "",
    industries: dup.industries || "", keySkills: dup.keySkills || "",
    yearsExperienceLabel: dup.yearsExperienceLabel || "",
    headline: dup.headline || dup.notes || "", notes: dup.notes || "",
    coverLetterText: dup.coverLetterText || "", additionalNotes: dup.additionalNotes || "",
    cvFile: dup.cvFile || null, coverLetterFile: dup.coverLetterFile || null,
    idPhotoFile: dup.idPhotoFile || null,
    createdAt: dup.createdAt || null, updatedAt: dup.updatedAt || null,
    source: dup.source || "Talent Pool",
  }));
  const sorted = [primary, ...dups].sort((a, b) => {
    const da = new Date(a.createdAt || 0).getTime(), db = new Date(b.createdAt || 0).getTime();
    if (da !== db) return da - db;
    return Number(a.id) - Number(b.id);
  });
  return sorted.map((s, i) => ({ ...s, submissionIndex: i + 1 }));
}

/* staleness = not contacted for 180+ days (or never contacted, added 180+ days ago) */
function isTalentStale(talent) {
  const refDate = talent.lastContactedAt || talent.createdAt;
  if (!refDate) return false;
  const daysSince = (Date.now() - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince > 180;
}

function getTalentPositionMatches(talent, positions = []) {
  if (!positions.length || !talent?.desiredRoles) return [];
  const keywords = (talent.desiredRoles + " " + (talent.skills || []).join(" "))
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((word) => word.length > 2);
  if (!keywords.length) return [];
  return positions
    .filter((position) => position.status === "published")
    .map((position) => {
      const haystack = [position.title, position.department, position.location, position.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const hits = keywords.filter((keyword) => haystack.includes(keyword)).length;
      return { ...position, hits };
    })
    .filter((position) => position.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 5);
}

function CollapsibleText({ text, lines = 3, style = {} }) {
  const [expanded, setExpanded]   = React.useState(false);
  const [overflows, setOverflows] = React.useState(false);
  const [heights, setHeights]     = React.useState({ collapsed: 0, full: 0 });
  const ref = React.useRef(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const collapsed = el.clientHeight;
    el.style.webkitLineClamp = "9999";
    const full = el.scrollHeight;
    el.style.webkitLineClamp = "";
    setHeights({ collapsed, full });
    setOverflows(full > collapsed + 4);
  }, [text, lines]);

  if (!text) return null;
  const measured = heights.collapsed > 0;

  return (
    <div>
      <div
        ref={ref}
        style={{
          ...style,
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: expanded ? 9999 : lines,
          overflow: "hidden",
          ...(measured ? {
            maxHeight: expanded ? heights.full + "px" : heights.collapsed + "px",
            transition: "max-height 0.35s ease",
          } : {}),
        }}
      >
        {text}
      </div>
      {overflows && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{ marginTop: 4, fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}
        >
          {expanded ? "Show less ▲" : "Show more ▼"}
        </button>
      )}
    </div>
  );
}

function TalentPoolView({ talents = [], onUpdate, onDelete, onBulkDelete, onAdd, onEditingChange, pendingRefreshCount = 0, onApplyPendingRefresh, onRefreshTalents, positions = [] }) {
  const [activeId, setActiveId] = React.useState(() => sessionStorage.getItem("heya_talentActiveId") || null);
  const [openSubmissionIndex, setOpenSubmissionIndex] = React.useState(() => {
    const v = sessionStorage.getItem("heya_talentSubIdx");
    return v ? Number(v) : null;
  });
  const [search, setSearch] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState("all");
  const [emailFilter, setEmailFilter] = React.useState("all");
  const [positionFilter, setPositionFilter] = React.useState("all");
  const [viewMode, setViewMode] = React.useState("grid");
  const [selected, setSelected] = React.useState([]);
  const [editing, setEditing] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [selectionMode, setSelectionMode] = React.useState(false);
  const [toasts, setToasts] = React.useState([]);

  // Persist talent pool nav state across page refreshes
  React.useEffect(() => {
    if (activeId) sessionStorage.setItem("heya_talentActiveId", activeId);
    else sessionStorage.removeItem("heya_talentActiveId");
  }, [activeId]);
  React.useEffect(() => {
    if (openSubmissionIndex) sessionStorage.setItem("heya_talentSubIdx", openSubmissionIndex);
    else sessionStorage.removeItem("heya_talentSubIdx");
  }, [openSubmissionIndex]);

  function pushToast(message, starred) {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, starred, exiting: false }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    }, 2400);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 2800);
  }
  const [serverResults, setServerResults] = React.useState(null); // null = no active server search
  const [searchBusy, setSearchBusy] = React.useState(false);
  // Local "marked contacted" overrides so the change shows instantly across the
  // grid, list, and re-opened profile until the next server refresh catches up.
  const [contactedOverrides, setContactedOverrides] = React.useState({});
  const [roxanneSheet, setRoxanneSheet] = React.useState(null);
  const [roxanneCheck, setRoxanneCheck] = React.useState(null); // { talent, loading, existingRun }
  const [analysisCheck, setAnalysisCheck] = React.useState(null);   // { talent, loading, existingRun }
  const [analysisModal, setAnalysisModal] = React.useState(null);   // { talent, existingRun|null }
  const [analysisSheet, setAnalysisSheet] = React.useState(null);   // { talent, initialRun, mode, instructions }
  // Feature: pools, favorites, unified top nav
  // selectedView: "all" | "none" | "pool:<id>" | "favorites"
  const [pools, setPools] = React.useState([]);
  const [favorites, setFavorites] = React.useState(() => new Set());
  const [selectedView, setSelectedView] = React.useState("all");
  const [createPoolOpen, setCreatePoolOpen] = React.useState(false);

  // Derived helpers
  const mainTab = selectedView === "favorites" ? "favorites" : "pool";
  const selectedPoolId = selectedView.startsWith("pool:") ? Number(selectedView.slice(5)) : selectedView;
  const applyContacted = React.useCallback(
    (t) => (t && contactedOverrides[t.id] ? { ...t, lastContactedAt: contactedOverrides[t.id] } : t),
    [contactedOverrides]
  );

  // Load pools on mount
  React.useEffect(() => {
    if (window.HEYA_API && typeof window.HEYA_API.listTalentPools === "function") {
      window.HEYA_API.listTalentPools().then(d => { if (d.ok) setPools(d.pools || []); }).catch(() => {});
    }
  }, []);

  // Derive favorites from talent records
  React.useEffect(() => {
    setFavorites(new Set(talents.filter(t => t.isFavorite).map(t => t.id)));
  }, [talents]);

  function toggleFavorite(talent, e) {
    e.stopPropagation();
    const newVal = !favorites.has(talent.id);
    setFavorites(prev => {
      const next = new Set(prev);
      newVal ? next.add(talent.id) : next.delete(talent.id);
      return next;
    });
    pushToast(
      newVal ? `${talent.name} added to Favorites` : `${talent.name} removed from Favorites`,
      newVal
    );
    if (window.HEYA_API && typeof window.HEYA_API.setTalentFavorite === "function") {
      window.HEYA_API.setTalentFavorite(talent.id, newVal).catch(() => {
        setFavorites(prev => {
          const next = new Set(prev);
          newVal ? next.delete(talent.id) : next.add(talent.id);
          return next;
        });
      });
    }
  }

  /* collect all unique tags across all talent entries */
  const allTags = React.useMemo(() => {
    const tagSet = new Set();
    talents.forEach((t) => (t.tags || []).forEach((tag) => tagSet.add(tag)));
    return Array.from(tagSet).sort();
  }, [talents]);

  /* Server-side search (services + controller). Debounced; falls back to a
     full-field client filter if the endpoint is unavailable or errors. */
  React.useEffect(() => {
    const q = search.trim();
    if (!q || !window.HEYA_API || typeof window.HEYA_API.searchTalentPool !== "function") {
      setServerResults(null);
      setSearchBusy(false);
      return;
    }
    let cancelled = false;
    setSearchBusy(true);
    const handle = setTimeout(async () => {
      try {
        const res = await window.HEYA_API.searchTalentPool(q, { tag: tagFilter });
        if (!cancelled) setServerResults(Array.isArray(res?.data) ? res.data : []);
      } catch {
        if (!cancelled) setServerResults(null); // fall back to client-side filtering
      } finally {
        if (!cancelled) setSearchBusy(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [search, tagFilter]);

  const usingServer = serverResults !== null;
  const baseList = usingServer ? serverResults : talents;

  const poolFilterOptions = React.useMemo(() => [
    { value: "all", label: "All pools" },
    ...pools.map(p => ({ value: String(p.id), label: p.name }))
  ], [pools]);

  const filtered = baseList.filter((talent) => {
    // When server results are active they are already text-ranked; only apply
    // the tag dropdown. Otherwise run the all-fields client fallback search.
    if (!usingServer) {
      const q = search.trim().toLowerCase();
      if (q && !talentSearchHaystack(talent).includes(q)) return false;
    }
    if (tagFilter !== "all" && !(talent.tags || []).includes(tagFilter)) return false;
    if (emailFilter === "with" && !talent.email) return false;
    if (emailFilter === "missing" && talent.email) return false;
    const hasPositionMatch = getTalentPositionMatches(talent, positions).length > 0;
    if (positionFilter === "matched" && !hasPositionMatch) return false;
    if (positionFilter === "unmatched" && hasPositionMatch) return false;
    // Top-nav pool filter
    if (selectedView.startsWith("pool:")) {
      const pid = Number(selectedView.slice(5));
      if (!(talent.poolIds || []).includes(pid)) return false;
    }
    return true;
  });
  const filteredIds = filtered.map((talent) => talent.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.includes(id));

  React.useEffect(() => {
    const ids = talents.map((talent) => talent.id);
    setSelected((current) => current.filter((id) => ids.includes(id)));
    if (activeId && !ids.includes(activeId)) setActiveId(null);
  }, [talents.length]);

  React.useEffect(() => {
    if (onEditingChange) onEditingChange(Boolean(activeId || editing || adding));
  }, [activeId, editing, adding, onEditingChange]);

  React.useEffect(() => () => {
    if (onEditingChange) onEditingChange(false);
  }, [onEditingChange]);

  function toggleOne(id) {
    setSelected((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      if (!next.length) setSelectionMode(false);
      return next;
    });
  }

  function toggleAll() {
    setSelectionMode(true);
    setSelected(allSelected ? [] : filteredIds);
  }

  function toggleMarkFor(id) {
    setSelectionMode(true);
    setSelected((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      if (!next.length) setSelectionMode(false);
      return next;
    });
  }

  async function deleteOne(talent) {
    if (!talent || !onDelete) return;
    if (!window.confirm(`Delete talent pool profile for "${talent.name || "this person"}"?`)) return;
    await onDelete(talent.id);
    setSelected((current) => current.filter((id) => id !== talent.id));
  }

  async function deleteSelected() {
    if (!selected.length || !onBulkDelete) return;
    if (!window.confirm(`Delete ${selected.length} selected talent pool profile${selected.length === 1 ? "" : "s"}?`)) return;
    await onBulkDelete(selected);
    setSelected([]);
    setSelectionMode(false);
  }

  function removeFromCurrentPool(talent) {
    const poolId = selectedView.startsWith("pool:") ? Number(selectedView.slice(5)) : null;
    if (!poolId) return;
    window.HEYA_API.removeTalentPoolMember(poolId, talent.id)
      .then(d => {
        if (d.ok) {
          refreshPoolsAndTalents();
          pushToast(`${talent.name || "Talent"} removed from pool`, false);
        }
      })
      .catch(() => pushToast("Failed to remove from pool", false));
  }

  async function saveEdit(payload) {
    if (!editing || !onUpdate) return;
    await onUpdate(editing.id, payload);
    setEditing(null);
  }

  const active = activeId ? talents.find((talent) => String(talent.id) === String(activeId)) : null;
  if (active) return (
    <TalentProfile
      talent={applyContacted(active)}
      positions={positions}
      onBack={() => { setActiveId(null); setOpenSubmissionIndex(null); }}
      onMarkedContacted={(ts) => setContactedOverrides((prev) => ({ ...prev, [active.id]: ts }))}
      openSubmissionIndex={openSubmissionIndex}
      isFavorite={favorites.has(active.id)}
      onToggleFavorite={(e) => toggleFavorite(active, e)}
    />
  );

  const tagOptions = [{ value: "all", label: "All tags" }, ...allTags.map((tag) => ({ value: tag, label: tag }))];
  const emailOptions = [
    { value: "all", label: "All emails" },
    { value: "with", label: "Has email" },
    { value: "missing", label: "Missing email" }
  ];
  const positionOptions = [
    { value: "all", label: "All positions" },
    { value: "matched", label: "Matches open role" },
    { value: "unmatched", label: "No role match" }
  ];

  // Favorites view overrides the display list
  const displayList = selectedView === "favorites"
    ? talents.filter(t => favorites.has(t.id))
    : filtered;

  function refreshPools() {
    if (window.HEYA_API && typeof window.HEYA_API.listTalentPools === "function") {
      window.HEYA_API.listTalentPools().then(d => { if (d.ok) setPools(d.pools || []); }).catch(() => {});
    }
  }

  function refreshPoolsAndTalents() {
    refreshPools();
    if (typeof onRefreshTalents === "function") onRefreshTalents();
  }

  return (
    <div className="page">
      {/* ── Unified top nav ─────────────────────────────────────────────── */}
      <PoolTopNav
        pools={pools}
        selectedView={selectedView}
        onSelect={setSelectedView}
        favorites={favorites}
        talents={talents}
        onCreatePool={() => setCreatePoolOpen(true)}
        onRefresh={refreshPoolsAndTalents}
        pushToast={pushToast}
      />

      <div className="page-head">
        <div>
          <div className="mono eyebrow">Talent Pool / {talents.length} contacts</div>
          <h1 className="page-title" style={{ marginTop: 8 }}>Talent <em>pool</em></h1>
          <p className="page-sub">Candidates who submitted CVs for future opportunities through the Careers portal.</p>
        </div>
        <div className="cluster">
          {pendingRefreshCount > 0 && (
            <button className="btn ghost sm" onClick={onApplyPendingRefresh}>
              New items available ({pendingRefreshCount})
            </button>
          )}
          {selected.length > 0 && (
            <button className="btn ghost sm" onClick={() => {
              const payload = {
                sourceType:        "talent-pool",
                audience:          "selected-talents",
                selectedTalentIds: selected,
                count:             selected.length,
                prompt:            `Use these ${selected.length} selected talent pool profile${selected.length === 1 ? "" : "s"} (IDs: ${selected.join(", ")}). Ask me whether to analyze, research, mark contacted, or draft a follow-up email before taking action.`,
              };
              try { sessionStorage.setItem("heya.pendingCrmAgentContext", JSON.stringify(payload)); } catch { /* ignore */ }
              window.dispatchEvent(new CustomEvent("heya:crm-agent-context", { detail: payload }));
            }}>Ask AI ({selected.length})</button>
          )}
          {selected.length > 0 && (
            <button className="btn ghost sm" onClick={deleteSelected}>Delete selected ({selected.length})</button>
          )}
          {onAdd && (
            <button className="btn add-talent-btn" onClick={() => setAdding(true)}>
              Add Talent
            </button>
          )}
        </div>
      </div>

      <div className="card talent-toolbar talent-toolbar--search" style={{ marginBottom: 16 }}>
        <form className="talent-search" onSubmit={(e) => e.preventDefault()}>
          <div className="talent-search__field">
            <svg className="talent-search__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2"></circle>
              <line x1="15.5" y1="15.5" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"></line>
            </svg>
            <input
              className="talent-search__input"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, skill, role, location, or tag..."
              aria-label="Search talent pool"
            />
          </div>
          <button type="submit" className="talent-search__submit">Search</button>
        </form>
        <div className="talent-toolbar-actions">
          <div className="toolbar-segment" aria-label="View mode">
            <button type="button" className={viewMode === "grid" ? "is-active" : ""} onClick={() => setViewMode("grid")} title="Grid view">
              <I.Pipeline />
            </button>
            <button type="button" className={viewMode === "list" ? "is-active" : ""} onClick={() => setViewMode("list")} title="List view">
              <I.Menu />
            </button>
          </div>
        </div>
        <div className="talent-filter-row">
          {selectionMode && (
            <label className="bulk-check talent-select-all">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
              <span>Select all</span>
            </label>
          )}
          {search.trim() && (
            <span className="talent-search__count mono">
              {searchBusy ? "Searching..." : `${filtered.length} result${filtered.length === 1 ? "" : "s"}`}
            </span>
          )}
          {allTags.length > 0 && (
            <FilterDropdown
              icon={<I.Filter />}
              label="Tags"
              value={tagFilter}
              defaultValue="all"
              options={tagOptions}
              onChange={setTagFilter}
              searchable
            />
          )}
          <FilterDropdown
            icon={<I.Mail />}
            label="Email"
            value={emailFilter}
            defaultValue="all"
            options={emailOptions}
            onChange={setEmailFilter}
          />
          <FilterDropdown
            icon={<I.Briefcase />}
            label="Positions"
            value={positionFilter}
            defaultValue="all"
            options={positionOptions}
            onChange={setPositionFilter}
          />
        </div>
      </div>

      {viewMode === "grid" ? (
      <div className="talent-grid">
        {displayList.length === 0 && (
          <div className="card" style={{ gridColumn: "1 / -1", textAlign: "center", padding: 40, color: "var(--muted)" }}>
            {selectedView === "favorites" ? "No favorites yet — star a candidate from the pool to save them here." : "No talent pool entries match this view."}
          </div>
        )}
        {displayList.map((talent) => {
          const tones = ["tone-a", "tone-b", "tone-c", "tone-d"];
          const tone = tones[(talent.name || "").charCodeAt(0) % tones.length];
          const allSkills = [...(talent.skills || []).slice(0, 3), ...(talent.tags || []).slice(0, 1)];
          return (
            <div key={talent.id} className={"talent-card clickable " + tone} onClick={() => setActiveId(talent.id)}>
              <div className="talent-card__banner">
                {selectionMode && (
                  <input
                    className="talent-select"
                    type="checkbox"
                    checked={selected.includes(talent.id)}
                    onChange={(event) => { event.stopPropagation(); toggleOne(talent.id); }}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Select ${talent.name}`}
                  />
                )}
                <div className="talent-card__menu-wrap">
                  <TalentCardMenu
                    isSelected={selected.includes(talent.id)}
                    onToggleMark={(event) => { event.stopPropagation(); toggleMarkFor(talent.id); }}
                    onEdit={(event) => { event.stopPropagation(); setEditing(talent); }}
                    onDelete={(event) => { event.stopPropagation(); deleteOne(talent); }}
                    onRemoveFromPool={selectedView.startsWith("pool:") ? (event) => { event.stopPropagation(); removeFromCurrentPool(talent); } : undefined}
                  />
                </div>
                <button
                  className={"talent-star-btn" + (favorites.has(talent.id) ? " is-starred" : "")}
                  onClick={(e) => toggleFavorite(talent, e)}
                  aria-label="Favorite"
                  title="Favorite"
                >
                  <I.Star style={{ width: 20, height: 20 }} />
                </button>
                {isTalentStale(applyContacted(talent)) && (
                  <span className="talent-stale-dot" title="Not contacted in 180+ days">●</span>
                )}
              </div>
              <div className="talent-card__avatar-wrap">
                <div className={"avatar talent-card__avatar " + tone} style={{ overflow: "hidden" }}>
                  {talent.idPhotoFile?.viewUrl
                    ? <img src={talent.idPhotoFile.viewUrl} alt={talent.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
                    : <I.User className="avatar-placeholder" style={{ width: "56%", height: "56%", opacity: 0.9 }} aria-label="No photo" />}
                </div>
              </div>
              <div className="talent-card__body">
                <div className="talent-card__name">{talent.name}</div>
                <div className="talent-card__role">{talent.title || "—"}</div>
                <div className="talent-card__meta">
                  {talent.location && <span className="talent-card__meta-chip">📍 {talent.location}</span>}
                  {talent.yearsExperienceLabel && <span className="talent-card__meta-chip">⏱ {talent.yearsExperienceLabel}</span>}
                </div>
                {allSkills.length > 0 && (
                  <div className="talent-card__chips">
                    {allSkills.map((s) => <span key={s} className="talent-card__chip">{s}</span>)}
                  </div>
                )}
                {(talent.pools || []).length > 0 && (
                  <div className="talent-pool-chips">
                    {(talent.pools || []).map(p => (
                      <span key={p.id} className="pool-category-chip">{p.name}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="talent-card__quick-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="talent-quick-btn"
                  data-tip="Analysis"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAnalysisCheck({ talent, loading: true, existingRun: null });
                    window.HEYA_API.getTalentAnalysis(talent.id)
                      .then((data) => {
                        const existing = data?.run || null;
                        setAnalysisCheck(null);
                        setAnalysisModal({ talent, existingRun: existing });
                      })
                      .catch(() => {
                        setAnalysisCheck(null);
                        setAnalysisModal({ talent, existingRun: null });
                      });
                  }}
                >
                  <I.BarChart />
                </button>
                <window.CrmEmailActionButton
                  className="talent-quick-btn"
                  title={talent.email ? `Email ${talent.email}` : "No email on file"}
                  email={talent.email}
                  name={talent.name}
                  sourceType="talent-pool"
                  sourceLabel="Talent Pool"
                  sourceId={talent.id}
                  subject={`Glondiasites - ${talent.name || "Talent Pool contact"}`}
                >
                  <I.Mail />
                </window.CrmEmailActionButton>
                <button
                  className="talent-quick-btn"
                  data-tip="Research"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRoxanneCheck({ talent, loading: true, existingRun: null });
                    window.HEYA_API.getTalentResearch(talent.id)
                      .then((d) => setRoxanneCheck((prev) => prev && prev.talent.id === talent.id ? { ...prev, loading: false, existingRun: d.run || null } : prev))
                      .catch(() => setRoxanneCheck((prev) => prev && prev.talent.id === talent.id ? { ...prev, loading: false } : prev));
                  }}
                >
                  <I.Globe />
                </button>
                {talent.duplicateCount > 0 && (
                  <button
                    className="talent-quick-btn talent-submissions-indicator"
                    data-tip={`${talent.duplicateCount + 1} submissions`}
                    style={{ position: "relative" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenSubmissionIndex(2);
                      setActiveId(talent.id);
                    }}
                  >
                    <I.Layers />
                    <span className="talent-submissions-badge">{talent.duplicateCount + 1}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      ) : (
      <div className="talent-list-view">
        {displayList.length === 0 && (
          <div className="card talent-list-empty">
            {selectedView === "favorites" ? "No favorites yet — star a candidate from the pool to save them here." : "No talent pool entries match this view."}
          </div>
        )}
        {displayList.map((talent) => {
          const tones = ["tone-a", "tone-b", "tone-c", "tone-d"];
          const tone = tones[(talent.name || "").charCodeAt(0) % tones.length];
          const matches = getTalentPositionMatches(talent, positions);
          const allSkills = [...(talent.skills || []).slice(0, 2), ...(talent.tags || []).slice(0, 2)];
          return (
            <div key={talent.id} className="talent-list-row" onClick={() => setActiveId(talent.id)}>
              {selectionMode && (
                <input
                  className="talent-select"
                  type="checkbox"
                  checked={selected.includes(talent.id)}
                  onChange={(event) => { event.stopPropagation(); toggleOne(talent.id); }}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Select ${talent.name}`}
                />
              )}
              <div className={"avatar talent-list-avatar " + tone}>
                {talent.idPhotoFile?.viewUrl
                  ? <img src={talent.idPhotoFile.viewUrl} alt={talent.name} />
                  : initialsFor(talent.name)}
              </div>
              <div className="talent-list-main">
                <div className="talent-list-name">
                  {talent.name}
                  {talent.duplicateCount > 0 && (
                    <span style={{ marginLeft: 8, fontSize: 10, color: "var(--muted)", fontWeight: 500 }}>
                      {talent.duplicateCount + 1} submissions
                    </span>
                  )}
                </div>
                <div className="talent-list-role">{talent.title || talent.desiredRoles || "No role set"}</div>
              </div>
              <div className="talent-list-contact">
                <span>{talent.email || "No email"}</span>
                <small>{talent.location || "Location not set"}</small>
              </div>
              <div className="talent-list-tags">
                {allSkills.length
                  ? allSkills.map((item) => <span key={item} className="talent-card__chip">{item}</span>)
                  : <span className="muted-mini">No tags</span>}
              </div>
              <div className="talent-list-match">
                {matches.length ? matches[0].title : "No open-role match"}
              </div>

              {/* Quick actions + star — always visible in list mode */}
              <div className="talent-list-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  className="talent-quick-btn"
                  data-tip="Analysis"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAnalysisCheck({ talent, loading: true, existingRun: null });
                    window.HEYA_API.getTalentAnalysis(talent.id)
                      .then((data) => {
                        setAnalysisCheck(null);
                        setAnalysisModal({ talent, existingRun: data?.run || null });
                      })
                      .catch(() => { setAnalysisCheck(null); setAnalysisModal({ talent, existingRun: null }); });
                  }}
                >
                  <I.BarChart />
                </button>
                <window.CrmEmailActionButton
                  className="talent-quick-btn"
                  title={talent.email ? `Email ${talent.email}` : "No email on file"}
                  email={talent.email}
                  name={talent.name}
                  sourceType="talent-pool"
                  sourceLabel="Talent Pool"
                  sourceId={talent.id}
                  subject={`Glondiasites - ${talent.name || "Talent Pool contact"}`}
                >
                  <I.Mail />
                </window.CrmEmailActionButton>
                <button
                  className="talent-quick-btn"
                  data-tip="Research"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRoxanneCheck({ talent, loading: true, existingRun: null });
                    window.HEYA_API.getTalentResearch(talent.id)
                      .then((d) => setRoxanneCheck((prev) => prev?.talent.id === talent.id ? { ...prev, loading: false, existingRun: d.run || null } : prev))
                      .catch(() => setRoxanneCheck((prev) => prev?.talent.id === talent.id ? { ...prev, loading: false } : prev));
                  }}
                >
                  <I.Globe />
                </button>
                {talent.duplicateCount > 0 && (
                  <button
                    className="talent-quick-btn talent-submissions-indicator"
                    data-tip={`${talent.duplicateCount + 1} submissions`}
                    style={{ position: "relative" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenSubmissionIndex(2);
                      setActiveId(talent.id);
                    }}
                  >
                    <I.Layers />
                    <span className="talent-submissions-badge">{talent.duplicateCount + 1}</span>
                  </button>
                )}
                <button
                  className={"talent-star-btn talent-star-btn--list" + (favorites.has(talent.id) ? " is-starred" : "")}
                  onClick={(e) => toggleFavorite(talent, e)}
                  aria-label="Favorite"
                  title="Favorite"
                >
                  <I.Star />
                </button>
              </div>

              {/* Three-dots menu at far end */}
              <div className="talent-list-menu" onClick={(e) => e.stopPropagation()}>
                <TalentCardMenu
                  isSelected={selected.includes(talent.id)}
                  onToggleMark={(e) => { e.stopPropagation(); toggleMarkFor(talent.id); }}
                  onEdit={(e) => { e.stopPropagation(); setEditing(talent); }}
                  onDelete={(e) => { e.stopPropagation(); deleteOne(talent); }}
                  onRemoveFromPool={selectedView.startsWith("pool:") ? (e) => { e.stopPropagation(); removeFromCurrentPool(talent); } : undefined}
                />
              </div>
            </div>
          );
        })}
      </div>
      )}

      {editing && (
        <TalentEditModal
          talent={editing}
          onCancel={() => setEditing(null)}
          onSave={saveEdit}
        />
      )}
      {adding && (
        <TalentAddModal
          onCancel={() => setAdding(false)}
          onSave={async (payload) => {
            if (onAdd) await onAdd(payload);
            setAdding(false);
          }}
        />
      )}
      {analysisCheck?.loading && (
        <div className="publish-scrim" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="roxanne-confirm" style={{ textAlign: "center", padding: "32px 40px" }}>
            <div style={{ color: "#4F7EF7", marginBottom: 12 }}><I.BarChart style={{ width: 22, height: 22 }} /></div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Checking previous analysis…</div>
          </div>
        </div>
      )}
      {analysisModal && (
        <AnalysisConfirmModal
          talent={analysisModal.talent}
          existingRun={analysisModal.existingRun}
          onCancel={() => setAnalysisModal(null)}
          onViewPrevious={() => {
            setAnalysisSheet({ talent: analysisModal.talent, initialRun: analysisModal.existingRun, mode: "view" });
            setAnalysisModal(null);
          }}
          onRunNew={(instructions) => {
            const talent = analysisModal.talent;
            setAnalysisModal(null);
            window.HEYA_API.runTalentAnalysis(talent.id, { instructions, force: true })
              .then((data) => setAnalysisSheet({ talent, initialRun: data.run, mode: "run", instructions }))
              .catch((err) => setAnalysisSheet({
                talent,
                mode: "run",
                instructions,
                initialRun: { id: null, status: "failed", error: err.message || "Failed to start analysis.", result: null },
              }));
          }}
        />
      )}
      {analysisSheet && (
        <AnalysisSheet
          talent={analysisSheet.talent}
          initialRun={analysisSheet.initialRun}
          mode={analysisSheet.mode}
          instructions={analysisSheet.instructions || ""}
          positions={positions}
          onClose={() => setAnalysisSheet(null)}
        />
      )}
      {roxanneCheck && (
        <RoxanneCheckModal
          talent={roxanneCheck.talent}
          loading={roxanneCheck.loading}
          existingRun={roxanneCheck.existingRun}
          onCancel={() => setRoxanneCheck(null)}
          onView={() => {
            setRoxanneSheet({ talent: roxanneCheck.talent, instructions: "", initialRun: roxanneCheck.existingRun });
            setRoxanneCheck(null);
          }}
          onRunNew={(instructions) => {
            setRoxanneSheet({ talent: roxanneCheck.talent, instructions, initialRun: null });
            setRoxanneCheck(null);
          }}
        />
      )}
      {roxanneSheet && (
        <RoxanneResearchSheet
          talent={roxanneSheet.talent}
          instructions={roxanneSheet.instructions}
          initialRun={roxanneSheet.initialRun}
          onClose={() => setRoxanneSheet(null)}
        />
      )}
      {createPoolOpen && (
        <CreatePoolModal
          talents={talents}
          pools={pools}
          setPools={setPools}
          onClose={() => setCreatePoolOpen(false)}
          onRefreshTalents={onRefreshTalents}
        />
      )}

      {/* Favorite toast tray — bottom-right, non-blocking */}
      <div className="fav-toast-tray" aria-live="polite" aria-atomic="false">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={"fav-toast" + (toast.exiting ? " fav-toast--out" : "")}
          >
            <span className="fav-toast__star">{toast.starred ? "★" : "☆"}</span>
            <span className="fav-toast__msg">{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterDropdown({ icon, label, value, defaultValue = "all", options = [], onChange, searchable = false }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const wrapRef = React.useRef(null);
  const selected = options.find((option) => option.value === value) || options[0];
  const isFiltered = value !== defaultValue;
  const visibleOptions = searchable && query.trim()
    ? options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(nextValue) {
    onChange(nextValue);
    setOpen(false);
    setQuery("");
  }

  function clear(event) {
    event.stopPropagation();
    onChange(defaultValue);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className={"filter-dropdown" + (open ? " is-open" : "") + (isFiltered ? " is-filtered" : "")} ref={wrapRef}>
      <button type="button" className="filter-dropdown__trigger" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span className="filter-dropdown__icon">{icon}</span>
        <span className="filter-dropdown__copy">
          <span>{label}</span>
          <strong>{selected?.label || label}</strong>
        </span>
        {isFiltered && <span className="filter-dropdown__clear" onClick={clear} title="Clear filter">x</span>}
        <I.ChevronDown className="filter-dropdown__chevron" />
      </button>
      {open && (
        <div className="filter-dropdown__menu">
          {searchable && (
            <div className="filter-dropdown__search">
              <I.Search />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search..." autoFocus />
            </div>
          )}
          <div className="filter-dropdown__items">
            {visibleOptions.length ? visibleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={"filter-dropdown__item" + (option.value === value ? " is-selected" : "")}
                onClick={() => choose(option.value)}
              >
                <span>{option.label}</span>
                {option.value === value && <I.Check />}
              </button>
            )) : (
              <div className="filter-dropdown__empty">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TalentCardMenu({ isSelected, onToggleMark, onEdit, onDelete, onRemoveFromPool }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="row-actions talent-card-actions" onClick={(event) => event.stopPropagation()}>
      <button className="icon-btn" title="Talent actions" onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}>
        <I.Dots />
      </button>
      {open && (
        <>
          <div className="menu-scrim" onClick={(event) => { event.stopPropagation(); setOpen(false); }} />
          <div className="menu">
            <button className="menu-item" onClick={(event) => { setOpen(false); onToggleMark(event); }}>
              {isSelected ? "Unmark profile" : "Mark profile"}
            </button>
            <button className="menu-item" onClick={(event) => { setOpen(false); onEdit(event); }}>Edit</button>
            {onRemoveFromPool && (
              <button className="menu-item" onClick={(event) => { setOpen(false); onRemoveFromPool(event); }}>Remove from pool</button>
            )}
            <button className="menu-item danger" onClick={(event) => { setOpen(false); onDelete(event); }}>Delete</button>
          </div>
        </>
      )}
    </div>
  );
}

function TalentEditModal({ talent, onCancel, onSave }) {
  const [draft, setDraft] = React.useState({
    name: talent.name || "",
    email: talent.email || "",
    phone: talent.phone || "",
    title: talent.title || "",
    location: talent.location || "",
    yearsExperience: talent.yearsExperienceLabel || "",
    skills: (talent.skills || []).join(", "),
    headline: talent.headline || "",
    tags: (talent.tags || []).join(", "),
    consentExpiresAt: talent.consentExpiresAt ? talent.consentExpiresAt.slice(0, 10) : ""
  });
  const [cvFile, setCvFile] = React.useState(null);
  const [idPhotoFile, setIdPhotoFile] = React.useState(null);
  const [idPhotoPreview, setIdPhotoPreview] = React.useState(talent.idPhotoFile?.viewUrl || null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function handleIdPhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIdPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setIdPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const cvUpload = cvFile ? await readFileAsUpload(cvFile) : null;
      const idPhotoUpload = idPhotoFile ? await readFileAsUpload(idPhotoFile) : null;
      await onSave({ ...draft, cvUpload, idPhotoUpload });
    } catch (err) {
      setError(err.message || "Unable to save this profile.");
      setSaving(false);
    }
  }

  return (
    <div className="publish-scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div className="edit-modal talent-profile-edit-modal">
        <div className="edit-modal-head">
          <div>
            <div className="mono eyebrow">Talent profile</div>
            <div className="edit-modal-title">Edit profile</div>
          </div>
          <button className="icon-btn" onClick={onCancel} title="Close">x</button>
        </div>
        <div className="edit-modal-body">
          <div className="grid cols-2" style={{ gap: 12 }}>
            <TalentField label="Name"><input className="ifield" value={draft.name} onChange={(e) => update("name", e.target.value)} /></TalentField>
            <TalentField label="Email"><input className="ifield" value={draft.email} onChange={(e) => update("email", e.target.value)} /></TalentField>
            <TalentField label="Phone"><input className="ifield" value={draft.phone} onChange={(e) => update("phone", e.target.value)} /></TalentField>
            <TalentField label="Title / desired roles"><input className="ifield" value={draft.title} onChange={(e) => update("title", e.target.value)} /></TalentField>
            <TalentField label="Location"><input className="ifield" value={draft.location} onChange={(e) => update("location", e.target.value)} /></TalentField>
            <TalentField label="Experience"><input className="ifield" value={draft.yearsExperience} onChange={(e) => update("yearsExperience", e.target.value)} /></TalentField>
          </div>
          <div style={{ marginTop: 12 }}>
            <TalentField label="Industries / skills"><input className="ifield" value={draft.skills} onChange={(e) => update("skills", e.target.value)} /></TalentField>
          </div>
          <div style={{ marginTop: 12 }}>
            <TalentField label="Tags (comma-separated, e.g. Finance, Senior, PNG-National)">
              <input className="ifield" value={draft.tags} onChange={(e) => update("tags", e.target.value)} placeholder="e.g. Finance, Senior, Available Now" />
            </TalentField>
          </div>
          <div style={{ marginTop: 12 }}>
            <TalentField label="Consent expiry date (data retention)">
              <input className="ifield" type="date" value={draft.consentExpiresAt} onChange={(e) => update("consentExpiresAt", e.target.value)} />
            </TalentField>
          </div>
          <div style={{ marginTop: 12 }}>
            <TalentField label="Summary"><textarea className="ifield" rows="5" value={draft.headline} onChange={(e) => update("headline", e.target.value)} /></TalentField>
          </div>

          <div style={{ borderTop: "1px solid var(--line-2)", paddingTop: 12, marginTop: 14 }}>
            <div className="mono eyebrow" style={{ marginBottom: 10 }}>Documents</div>
            <div className="grid cols-2" style={{ gap: 12 }}>
              <TalentField label={talent.cvFile ? "Replace CV (PDF / DOC / DOCX)" : "Upload CV (PDF / DOC / DOCX)"}>
                {talent.cvFile && (
                  <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>
                    Current: <a href={talent.cvFile.downloadUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{talent.cvFile.name}</a>
                  </div>
                )}
                <input type="file" accept=".pdf,.doc,.docx,.txt" className="ifield" style={{ padding: "6px 8px" }}
                  onChange={(e) => setCvFile(e.target.files?.[0] || null)} />
              </TalentField>
              <TalentField label={talent.idPhotoFile ? "Replace ID Photo" : "Upload ID Photo"}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {idPhotoPreview && (
                    <div style={{ width: 48, height: 48, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "1px solid var(--line-2)" }}>
                      <img src={idPhotoPreview} alt="ID" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}
                  <input type="file" accept="image/*" className="ifield" style={{ padding: "6px 8px" }}
                    onChange={handleIdPhotoChange} />
                </div>
              </TalentField>
            </div>
          </div>

          {error && <div className="inbox-action-status is-error" style={{ marginTop: 12 }}>{error}</div>}
        </div>
        <div className="edit-modal-foot">
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Changes update only this talent pool profile.</span>
          <div className="cluster">
            <button className="btn" onClick={onCancel}>Cancel</button>
            <button className="btn accent" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const PROFILE_TABS = [
  { id: "overview",     short: "Overview",   full: "Overview",         color: "#5B8DEF", border: "#2B5EBF" },
  { id: "submissions",  short: "Submissions", full: "Submissions",      color: "#4DD0E1", border: "#0097A7" },
  { id: "cv",           short: "CV",          full: "CV & Cover Letter", color: "#9575CD", border: "#512DA8" },
  { id: "police",       short: "Police",      full: "Police Clearance",  color: "#66BB6A", border: "#2E7D32" },
  { id: "medical",      short: "Medical",     full: "Medical",           color: "#FF8A65", border: "#E64A19" },
  { id: "certs",        short: "Certs",       full: "Certificates",      color: "#F5C842", border: "#C89F1A" },
  { id: "achievements", short: "Awards",      full: "Achievements",      color: "#EF5350", border: "#B71C1C" },
  { id: "analysis",     short: "Analysis",    full: "Analysis",          color: "#42A5F5", border: "#1565C0" },
  { id: "research",     short: "Research",    full: "Research",          color: "#26C6DA", border: "#00838F" },
  { id: "jobfit",       short: "Job Fit",     full: "Job Fit",           color: "#FFA726", border: "#E65100" },
  { id: "hrnotes",      short: "HR Notes",    full: "HR Notes",          color: "#CE93D8", border: "#6A1B9A" },
];

function CpsEmptyState({ icon, title, body }) {
  return (
    <div className="cps-empty-state">
      <div className="cps-empty-icon">{icon}</div>
      <div className="cps-empty-title">{title}</div>
      <div className="cps-empty-body">{body}</div>
    </div>
  );
}

// ── Document tab (police, medical, certs, achievements, cv extras) ───────────

const DOC_FIELD_CONFIG = {
  "cv":              { icon: "📄", accept: ".pdf,.doc,.docx,.txt,.rtf", label: "CV / Résumé" },
  "cover-letter":    { icon: "✉️",  accept: ".pdf,.doc,.docx,.txt,.rtf", label: "Cover Letter" },
  "police-clearance":{ icon: "🛡️",  accept: ".pdf,.jpg,.jpeg,.png",      label: "Police Clearance" },
  "medical-doc":     { icon: "🏥",  accept: ".pdf,.jpg,.jpeg,.png",      label: "Medical Document" },
  "certificate":     { icon: "🎓",  accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx", label: "Certificate" },
  "achievement-doc": { icon: "🏆",  accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx", label: "Achievement" },
};

function fmtFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtUploadStamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-PG", { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString("en-PG", { hour: "2-digit", minute: "2-digit" });
  return `${date} at ${time}`;
}

function CpsDocCard({ doc, fieldName, onDelete, deleting }) {
  const cfg = DOC_FIELD_CONFIG[fieldName] || DOC_FIELD_CONFIG["certificate"];
  const stamp = fmtUploadStamp(doc.uploadedAt);
  return (
    <div className="cps-doc-card">
      <div className="cps-doc-icon">{cfg.icon}</div>
      <div className="cps-doc-meta">
        <div className="cps-doc-name" title={doc.originalName}>{doc.originalName || doc.name}</div>
        <div className="cps-doc-info">
          {doc.sizeBytes ? <span>{fmtFileSize(doc.sizeBytes)}</span> : null}
          {stamp && (
            <span className="cps-doc-stamp">
              🕐 Uploaded {stamp}
            </span>
          )}
        </div>
      </div>
      <div className="cps-doc-actions">
        <a
          className="btn sm"
          href={doc.downloadUrl}
          target="_blank"
          rel="noreferrer"
          style={{ textDecoration: "none" }}
        >
          Download
        </a>
        <button
          className="cps-doc-delete-btn"
          onClick={onDelete}
          disabled={deleting}
          title="Delete document"
        >
          {deleting ? "…" : <I.Trash />}
        </button>
      </div>
    </div>
  );
}

function CpsUploadZone({ fieldName, onUpload, uploading, inputRef: externalRef, hiddenVisual = false }) {
  const cfg = DOC_FIELD_CONFIG[fieldName] || DOC_FIELD_CONFIG["certificate"];
  const internalRef = React.useRef(null);
  const inputRef = externalRef || internalRef;
  const [dragOver, setDragOver] = React.useState(false);

  async function handleFiles(files) {
    if (!files || !files.length || uploading) return;
    const file = files[0];
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result.split(",")[1] || "");
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsDataURL(file);
    });
    onUpload({ name: file.name, type: file.type, contentBase64: base64 });
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div
      className={"cps-doc-upload-zone" + (dragOver ? " is-drag-over" : "")}
      style={hiddenVisual ? { display: "none" } : undefined}
      onClick={() => !uploading && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={cfg.accept}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="cps-doc-upload-icon">{uploading ? "⏳" : "⬆️"}</div>
      <div className="cps-doc-upload-label">
        {uploading
          ? "Uploading…"
          : <><strong>Click to upload</strong> or drag and drop a file here<br /><span style={{ fontSize: 11 }}>{cfg.accept.split(",").join(", ")}</span></>
        }
      </div>
    </div>
  );
}

function CpsDocumentTab({ talent, fieldNames, sectionLabel, uploadSignal, onDocCountChange, onReady, onRegisterUploadTrigger }) {
  const [docs, setDocs]           = React.useState(null);
  const [loading, setLoading]     = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState(null);
  const [error, setError]         = React.useState(null);
  const fieldInputRefs            = React.useRef({});

  const fields = React.useMemo(
    () => Array.isArray(fieldNames) ? fieldNames : [fieldNames],
    [Array.isArray(fieldNames) ? fieldNames.join("|") : fieldNames]
  );
  const fieldsKey = fields.join("|");

  React.useEffect(() => {
    setLoading(true);
    setError(null);
    window.HEYA_API.getTalentDocuments(talent.id)
      .then((d) => {
        const filtered = (d.documents || []).filter((doc) => fields.includes(doc.fieldName));
        setDocs(filtered);
        setLoading(false);
        if (onDocCountChange) {
          fields.forEach((f) => onDocCountChange(f, filtered.filter((doc) => doc.fieldName === f).length));
        }
        if (onReady) onReady(true);
      })
      .catch((err) => { setError(err.message || "Could not load documents."); setLoading(false); if (onReady) onReady(true); });
  }, [talent.id, fieldsKey]);

  // Trigger file input click when parent signals an upload for this tab's field
  React.useEffect(() => {
    if (!uploadSignal) return;
    const { fieldName } = uploadSignal;
    if (fields.includes(fieldName)) {
      const clickInput = () => fieldInputRefs.current[fieldName]?.current?.click();
      clickInput();
      setTimeout(clickInput, 0);
    }
  }, [uploadSignal]);

  React.useEffect(() => {
    if (!onRegisterUploadTrigger) return;
    fields.forEach((fieldName) => {
      onRegisterUploadTrigger(fieldName, () => fieldInputRefs.current[fieldName]?.current?.click());
    });
    return () => {
      fields.forEach((fieldName) => onRegisterUploadTrigger(fieldName, null));
    };
  }, [fieldsKey, onRegisterUploadTrigger]);

  async function handleUpload(fieldName, upload) {
    setUploading(true);
    setError(null);
    try {
      const d = await window.HEYA_API.uploadTalentDocument(talent.id, fieldName, upload);
      setDocs((prev) => {
        const next = [...(prev || []), d.document];
        if (onDocCountChange) onDocCountChange(fieldName, next.filter((doc) => doc.fieldName === fieldName).length);
        return next;
      });
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc) {
    setDeletingId(doc.id);
    setError(null);
    try {
      await window.HEYA_API.deleteTalentDocument(talent.id, doc.id);
      setDocs((prev) => {
        const next = (prev || []).filter((d) => d.id !== doc.id);
        if (onDocCountChange) onDocCountChange(doc.fieldName, next.filter((d) => d.fieldName === doc.fieldName).length);
        return next;
      });
    } catch (err) {
      setError(err.message || "Could not delete document.");
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return <div style={{ padding: 24, color: "var(--muted)", fontSize: 13 }}>Loading documents…</div>;
  }

  // Group docs by fieldName
  const byField = {};
  fields.forEach((f) => { byField[f] = []; });
  (docs || []).forEach((doc) => { if (byField[doc.fieldName]) byField[doc.fieldName].push(doc); });

  return (
    <div className="stack" style={{ gap: 20 }}>
      {error && (
        <div style={{ padding: "8px 12px", background: "#fff3f3", border: "1px solid #f5c6c6", borderRadius: 8, color: "#c62828", fontSize: 12 }}>
          {error}
        </div>
      )}

      {fields.map((fieldName) => {
        const cfg = DOC_FIELD_CONFIG[fieldName] || DOC_FIELD_CONFIG["certificate"];
        const fieldDocs = byField[fieldName] || [];
        if (!fieldInputRefs.current[fieldName]) fieldInputRefs.current[fieldName] = { current: null };
        const inputRef = fieldInputRefs.current[fieldName];
        return (
          <div key={fieldName} className="stack" style={{ gap: 8 }}>
            {fields.length > 1 && (
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", marginBottom: 2 }}>
                {cfg.icon} {cfg.label}
              </div>
            )}
            <div className="cps-doc-list">
              {fieldDocs.map((doc) => (
                <CpsDocCard
                  key={doc.id}
                  doc={doc}
                  fieldName={fieldName}
                  onDelete={() => handleDelete(doc)}
                  deleting={deletingId === doc.id}
                />
              ))}
            </div>
            <CpsUploadZone
              fieldName={fieldName}
              onUpload={(upload) => handleUpload(fieldName, upload)}
              uploading={uploading}
              inputRef={inputRef}
              hiddenVisual={fieldDocs.length > 0}
            />
          </div>
        );
      })}
    </div>
  );
}


// ── Inline Analysis tab panel ────────────────────────────────────────────────

function CpsAnalysisPanel({ talent, positions }) {
  const [run, setRun]         = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [error, setError]     = React.useState(null);
  const [tab, setTab]         = React.useState("summary");
  const pollRef               = React.useRef(null);

  React.useEffect(() => {
    window.HEYA_API.getTalentAnalysis(talent.id)
      .then((d) => { setRun(d.run || null); setLoading(false); })
      .catch(() => setLoading(false));
    return () => clearInterval(pollRef.current);
  }, [talent.id]);

  function startPolling(runId) {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetch(`/api/admin/careers/talent-pool/${talent.id}/analysis/${runId}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.ok || !d.run) return;
          setRun(d.run);
          if (d.run.status !== "queued" && d.run.status !== "running") {
            clearInterval(pollRef.current);
            setRunning(false);
          }
        })
        .catch(() => {});
    }, 3000);
  }

  function handleRun() {
    setRunning(true);
    setError(null);
    window.HEYA_API.runTalentAnalysis(talent.id, { force: true })
      .then((d) => {
        setRun(d.run);
        if (d.run && (d.run.status === "queued" || d.run.status === "running")) startPolling(d.run.id);
        else setRunning(false);
      })
      .catch((err) => { setError(err.message || "Analysis failed."); setRunning(false); });
  }

  const analysisTabs = [
    { id: "summary", label: "Summary" },
    { id: "skills",  label: "Skills & Experience" },
    { id: "signals", label: "Work Style Signals" },
    { id: "gaps",    label: "Gaps & Questions" },
    { id: "opps",    label: "Opportunities" },
  ];

  if (loading) return <div style={{ color: "var(--muted)", fontSize: 13, padding: 12 }}>Loading…</div>;

  const result = run?.result || null;
  const isActive = run?.status === "queued" || run?.status === "running";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>
          {run?.completedAt && <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 11 }}>Last run {new Date(run.completedAt).toLocaleString()}</span>}
        </div>
        <button className="btn ghost sm" onClick={handleRun} disabled={running || isActive} style={{ fontSize: 12 }}>
          {running || isActive ? "Running…" : run ? "↻ Re-run" : "Run Analysis"}
        </button>
      </div>

      {error && <div style={{ padding: "10px 14px", background: "#fdf0f0", border: "1px solid #e05252", borderRadius: 8, color: "#c0392b", fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {(running || isActive) && !result && (
        <div style={{ color: "var(--muted)", fontSize: 13, padding: 12 }}>Analysing candidate profile… This usually takes 10–20 seconds.</div>
      )}

      {!run && !running && !error && (
        <CpsEmptyState icon="🤖" title="AI Analysis" body="Run an AI analysis to get a skills breakdown, role suitability score, and hiring recommendation for this candidate." />
      )}

      {result && result.summary && (
        <>
          <div className="roxanne-sheet__tabs" style={{ marginLeft: -28, marginRight: -28, paddingLeft: 28 }}>
            {analysisTabs.map((t) => (
              <button key={t.id} className={"roxanne-tab" + (tab === t.id ? " is-active analysis-tab-active" : "")} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div style={{ paddingTop: 16 }}>
            {tab === "summary"  && <AnalysisSummaryTab result={result} talent={talent} run={run} />}
            {tab === "skills"   && <AnalysisSkillsTab result={result} talent={talent} positions={positions} />}
            {tab === "signals"  && <AnalysisSignalsTab result={result} />}
            {tab === "gaps"     && <AnalysisGapsAiTab result={result} />}
            {tab === "opps"     && <AnalysisOppsTab result={result} talent={talent} positions={positions} />}
          </div>
        </>
      )}
    </div>
  );
}

// ── Inline Research tab panel ─────────────────────────────────────────────────

function CpsResearchPanel({ talent }) {
  const [run, setRun]               = React.useState(null);
  const [loading, setLoading]       = React.useState(true);
  const [running, setRunning]       = React.useState(false);
  const [error, setError]           = React.useState(null);
  const [researchTab, setResearchTab] = React.useState("linkedin");
  const pollRef                     = React.useRef(null);

  React.useEffect(() => {
    window.HEYA_API.getTalentResearch(talent.id)
      .then((d) => { setRun(d.run || null); setLoading(false); })
      .catch(() => setLoading(false));
    return () => clearInterval(pollRef.current);
  }, [talent.id]);

  function startPolling(runId) {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetch(`/api/admin/careers/talent-pool/${talent.id}/research/${runId}`)
        .then((r) => r.json())
        .then((d) => {
          if (!d.ok || !d.run) return;
          setRun(d.run);
          if (d.run.status !== "queued" && d.run.status !== "running") {
            clearInterval(pollRef.current);
            setRunning(false);
          }
        })
        .catch(() => {});
    }, 3000);
  }

  function handleRun() {
    setRunning(true);
    setError(null);
    window.HEYA_API.runTalentResearch(talent.id, {})
      .then((d) => {
        setRun(d.run);
        if (d.run && (d.run.status === "queued" || d.run.status === "running")) startPolling(d.run.id);
        else setRunning(false);
      })
      .catch((err) => { setError(err.message || "Research failed."); setRunning(false); });
  }

  if (loading) return <div style={{ color: "var(--muted)", fontSize: 13, padding: 12 }}>Loading…</div>;

  const result = run?.result || null;
  const isActive = run?.status === "queued" || run?.status === "running";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          {run?.completedAt && <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: 11 }}>Last run {new Date(run.completedAt).toLocaleString()}</span>}
        </div>
        <button className="btn ghost sm" onClick={handleRun} disabled={running || isActive} style={{ fontSize: 12 }}>
          {running || isActive ? "Searching…" : run ? "↻ Re-run" : "Run Research"}
        </button>
      </div>

      {error && <div style={{ padding: "10px 14px", background: "#fdf0f0", border: "1px solid #e05252", borderRadius: 8, color: "#c0392b", fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {(running || isActive) && !result && (
        <div style={{ color: "var(--muted)", fontSize: 13, padding: 12 }}>Searching for background information… This may take up to 30 seconds.</div>
      )}

      {!run && !running && !error && (
        <CpsEmptyState icon="🔍" title="Background Research" body="AI-assisted background research and online presence summary will appear here after running a research scan." />
      )}

      {result && (() => {
        const allCollected = result.rawCollectedSources || result.sources || [];
        const liSources    = allCollected.filter((s) => s.bucket === "linkedin" || s.type === "linkedin");
        const fbSources    = allCollected.filter((s) => s.bucket === "facebook" || s.type === "facebook");
        const otherSources = allCollected.filter((s) => {
          const b = s.bucket || (s.type === "linkedin" ? "linkedin" : s.type === "facebook" ? "facebook" : "other");
          return b === "other";
        });
        const [rTab, setRTab] = [researchTab, setResearchTab];
        const rtabs = [
          { id: "linkedin",     label: "LinkedIn",      color: "#0077B5", count: liSources.length },
          { id: "facebook",     label: "Facebook",      color: "#1877F2", count: fbSources.length },
          { id: "other",        label: "Other",         color: "#7B61FF", count: otherSources.length },
          { id: "allcollected", label: "All Collected", color: "#555",    count: allCollected.length },
        ];
        return (
          <>
            <div className="roxanne-sheet__tabs" style={{ marginLeft: -28, marginRight: -28, paddingLeft: 28 }}>
              {rtabs.map((t) => (
                <button key={t.id} className={"roxanne-tab" + (rTab === t.id ? " is-active" : "")}
                        onClick={() => setRTab(t.id)}
                        style={rTab === t.id ? { borderBottomColor: t.color, color: t.color } : {}}>
                  {t.label}
                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700,
                                 background: t.count > 0 ? t.color : "var(--line-2)",
                                 color: t.count > 0 ? "#fff" : "var(--muted)",
                                 borderRadius: 8, padding: "1px 5px" }}>{t.count}</span>
                </button>
              ))}
            </div>
            <div style={{ paddingTop: 12 }}>
              {rTab === "linkedin"     && <ResearchPlatformTab platformSources={liSources}    allSources={allCollected} result={result} tabQueries={(result.researchPlan && result.researchPlan.linkedin)  || result.searchQueries || []} emptyMessage="No LinkedIn profiles were found for this candidate." />}
              {rTab === "facebook"     && <ResearchPlatformTab platformSources={fbSources}    allSources={allCollected} result={result} tabQueries={(result.researchPlan && result.researchPlan.facebook)  || result.searchQueries || []} emptyMessage="No Facebook profiles or pages were found." />}
              {rTab === "other"        && <ResearchPlatformTab platformSources={otherSources} allSources={allCollected} result={result} tabQueries={(result.researchPlan && result.researchPlan.other)     || result.searchQueries || []} emptyMessage="No other web sources were found for this candidate." />}
              {rTab === "allcollected" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, padding: "10px 0 4px" }}>
                    All {allCollected.length} source{allCollected.length !== 1 ? "s" : ""} collected during research, sorted by confidence score.
                  </div>
                  <StrengthSection title="High Confidence"   sources={allCollected.filter(s => s.matchStrength === "confirmed" || s.matchStrength === "likely")} defaultOpen={true}  accentColor="#2DC88A" />
                  <StrengthSection title="Possible Leads"    sources={allCollected.filter(s => s.matchStrength === "possible")}  defaultOpen={true}  accentColor="#F5A623" />
                  <StrengthSection title="Weak Leads"        sources={allCollected.filter(s => s.matchStrength === "weak")}      defaultOpen={true}  accentColor="#aaa" />
                  <StrengthSection title="Rejected / Noise"  sources={allCollected.filter(s => s.matchStrength === "rejected")}  defaultOpen={false} accentColor="#E05252" showRejectedNote={true} />
                  {allCollected.every(s => !s.matchStrength) && allCollected.map((s, i) => <SourceCard key={i} s={s} i={i} />)}
                </div>
              )}
              {result.followUpQuestions && result.followUpQuestions.length > 0 && (
                <div style={{ borderTop: "1px solid var(--line)", marginTop: 24, paddingTop: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>💬 Suggested Follow-Up Questions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {result.followUpQuestions.map((q, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--paper)", fontSize: 13, alignItems: "flex-start" }}>
                        <span style={{ color: "var(--accent)", fontWeight: 700, flexShrink: 0 }}>Q{i + 1}</span>
                        <span style={{ lineHeight: 1.55 }}>{q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ borderTop: "1px solid var(--line)", marginTop: 20, paddingTop: 14, display: "flex", flexDirection: "column", gap: 5 }}>
                {(result.caveats || []).map((c, i) => (
                  <div key={i} style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.55 }}>⚠ {c}</div>
                ))}
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const DOC_TAB_FIELDS = {
  cv:           ["cv", "cover-letter"],
  police:       ["police-clearance"],
  medical:      ["medical-doc"],
  certs:        ["certificate"],
  achievements: ["achievement-doc"],
};

function TalentProfile({ talent, onBack, positions = [], onMarkedContacted, openSubmissionIndex, isFavorite, onToggleFavorite }) {
  const [lastContacted, setLastContacted] = React.useState(talent.lastContactedAt || null);
  const [contactBusy, setContactBusy]     = React.useState(false);
  const [contactError, setContactError]   = React.useState("");
  const [activeSubmission, setActiveSubmission] = React.useState(null);
  const [profileTab, setProfileTab] = React.useState(() => {
    const saved = sessionStorage.getItem("heya_profileTab");
    return (saved && PROFILE_TABS.some((t) => t.id === saved)) ? saved : "overview";
  });
  // After entrance stagger completes, zero out all tab delays so clicks are instant.
  const [tabsEntered, setTabsEntered] = React.useState(false);
  const [fieldDocCounts, setFieldDocCounts] = React.useState({});
  const [docTabReady, setDocTabReady]       = React.useState(false);
  const [uploadSignal, setUploadSignal]     = React.useState(null);
  const [uploadDdOpen, setUploadDdOpen]     = React.useState(false);
  const [analysisCheck, setAnalysisCheck]   = React.useState(null);
  const [analysisModal, setAnalysisModal]   = React.useState(null);
  const [analysisSheet, setAnalysisSheet]   = React.useState(null);
  const [roxanneCheck, setRoxanneCheck]     = React.useState(null);
  const [roxanneSheet, setRoxanneSheet]     = React.useState(null);
  const uploadTriggersRef                   = React.useRef({});
  const stale = isTalentStale({ ...talent, lastContactedAt: lastContacted });
  const submissions = React.useMemo(() => buildSubmissions(talent), [talent]);

  React.useEffect(() => {
    // 12 tabs × 0.04s stagger + 0.5s longest transition = ~1s; give a little headroom
    const t = setTimeout(() => setTabsEntered(true), 1100);
    return () => clearTimeout(t);
  }, []);

  React.useEffect(() => {
    if (openSubmissionIndex == null) return;
    const target = submissions.find((s) => s.submissionIndex === openSubmissionIndex);
    if (target) { setActiveSubmission(target); setProfileTab("submissions"); }
  }, [openSubmissionIndex, submissions]);

  React.useEffect(() => { setLastContacted(talent.lastContactedAt || null); }, [talent.lastContactedAt]);
  React.useEffect(() => { sessionStorage.setItem("heya_profileTab", profileTab); }, [profileTab]);

  // Reset doc state when switching talent profile
  React.useEffect(() => {
    setFieldDocCounts({});
    setDocTabReady(false);
    setUploadDdOpen(false);
  }, [talent.id]);

  // Close upload dropdown and mark tab not-ready whenever tab changes
  React.useEffect(() => {
    setUploadDdOpen(false);
    setDocTabReady(false);
  }, [profileTab]);

  const matchedPositions = React.useMemo(() => getTalentPositionMatches(talent, positions), [positions, talent]);

  function handleDocCount(fieldName, count) {
    setFieldDocCounts((prev) => ({ ...prev, [fieldName]: count }));
  }

  function triggerUpload(fieldName) {
    const trigger = uploadTriggersRef.current[fieldName];
    if (typeof trigger === "function") {
      trigger();
    } else {
      setUploadSignal({ fieldName, tick: Date.now() });
    }
    setUploadDdOpen(false);
  }

  const registerUploadTrigger = React.useCallback((fieldName, trigger) => {
    if (trigger) uploadTriggersRef.current[fieldName] = trigger;
    else delete uploadTriggersRef.current[fieldName];
  }, []);

  const activeFields    = DOC_TAB_FIELDS[profileTab] || [];
  const uploadableFields = activeFields.filter((f) => !fieldDocCounts[f]);

  async function handleMarkContacted() {
    setContactBusy(true);
    setContactError("");
    try {
      const resp = await window.HEYA_API.markTalentPoolContacted(talent.id);
      const ts = resp?.lastContactedAt || new Date().toISOString();
      setLastContacted(ts);
      if (onMarkedContacted) onMarkedContacted(ts);
    } catch (err) {
      setContactError(err?.message || "Could not mark as contacted. Please try again.");
    } finally {
      setContactBusy(false);
    }
  }

  const subPalette = [
    { bg: "#4DD0E1", border: "#0097A7" },
    { bg: "#9575CD", border: "#512DA8" },
    { bg: "#81C784", border: "#388E3C" },
    { bg: "#FF8A65", border: "#E64A19" },
    { bg: "#F5C842", border: "#C89F1A" },
  ];

  return (
    <div className="page">
      <button className="btn ghost sm cps-back-btn" onClick={onBack}>← Back to talent pool</button>

      {analysisCheck?.loading && (
        <div className="publish-scrim" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="roxanne-confirm" style={{ textAlign: "center", padding: "32px 40px" }}>
            <div style={{ color: "#4F7EF7", marginBottom: 12 }}><I.BarChart style={{ width: 22, height: 22 }} /></div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Checking previous analysis…</div>
          </div>
        </div>
      )}
      {analysisModal && (
        <AnalysisConfirmModal
          talent={analysisModal.talent}
          existingRun={analysisModal.existingRun}
          onCancel={() => setAnalysisModal(null)}
          onViewPrevious={() => { setAnalysisSheet({ talent: analysisModal.talent, initialRun: analysisModal.existingRun, mode: "view" }); setAnalysisModal(null); }}
          onRunNew={(instructions) => {
            const t = analysisModal.talent;
            setAnalysisModal(null);
            window.HEYA_API.runTalentAnalysis(t.id, { instructions, force: true })
              .then((data) => setAnalysisSheet({ talent: t, initialRun: data.run, mode: "run", instructions }))
              .catch((err) => setAnalysisSheet({ talent: t, mode: "run", instructions, initialRun: { id: null, status: "failed", error: err.message || "Failed.", result: null } }));
          }}
        />
      )}
      {analysisSheet && (
        <AnalysisSheet
          talent={analysisSheet.talent}
          initialRun={analysisSheet.initialRun}
          mode={analysisSheet.mode}
          instructions={analysisSheet.instructions || ""}
          positions={positions}
          onClose={() => setAnalysisSheet(null)}
        />
      )}
      {roxanneCheck && (
        <RoxanneCheckModal
          talent={roxanneCheck.talent}
          loading={roxanneCheck.loading}
          existingRun={roxanneCheck.existingRun}
          onCancel={() => setRoxanneCheck(null)}
          onView={() => { setRoxanneSheet({ talent: roxanneCheck.talent, instructions: "", initialRun: roxanneCheck.existingRun }); setRoxanneCheck(null); }}
          onRunNew={(instructions) => { setRoxanneSheet({ talent: roxanneCheck.talent, instructions, initialRun: null }); setRoxanneCheck(null); }}
        />
      )}
      {roxanneSheet && (
        <RoxanneResearchSheet
          talent={roxanneSheet.talent}
          instructions={roxanneSheet.instructions}
          initialRun={roxanneSheet.initialRun}
          onClose={() => setRoxanneSheet(null)}
        />
      )}

      <div className="cps-profile-outer">
        {/* ── Top tab markers ── */}
        <div className="cps-tab-tray">
          {PROFILE_TABS.map((t, i) => (
            <button
              key={t.id}
              className={"cps-top-tab" + (profileTab === t.id ? " is-active" : "")}
              style={{
                background: t.color,
                borderColor: t.border,
                // Stagger only during entrance; after all tabs have risen, clear the delay
                // so every click responds immediately with no artificial lag.
                transitionDelay: tabsEntered ? "0s" : `${i * 0.04}s`,
                zIndex: i + 1,
              }}
              onClick={() => setProfileTab(t.id)}
              title={t.full}
            >
              <span className="cps-tab-num">{i + 1}</span>
              <span className="cps-tab-name">{t.short}</span>
            </button>
          ))}
        </div>

        <div className="talent-profile-card">
          {activeSubmission && (
            <SubmissionSheet submission={activeSubmission} onClose={() => setActiveSubmission(null)} />
          )}
          {submissions.length > 1 && (
            <div className="submission-marker-tray">
              {submissions.filter(sub => !sub.isPrimary).map((sub, markerIdx) => {
                const { bg, border } = subPalette[markerIdx % subPalette.length];
                const isActive = activeSubmission?.id === sub.id;
                return (
                  <button
                    key={sub.id}
                    className={"submission-marker" + (isActive ? " is-active" : "")}
                    style={{ background: bg, borderColor: border, animationDelay: `${0.5 + markerIdx * 0.18}s` }}
                    onClick={() => { setActiveSubmission(isActive ? null : sub); setProfileTab("submissions"); }}
                    title={`Submission ${sub.submissionIndex}`}
                    aria-label={`View submission ${sub.submissionIndex}`}
                    aria-pressed={isActive}
                  >
                    <span className="submission-marker-label">{sub.submissionIndex}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Hero ── */}
          <div className="talent-profile-hero">
            <div className="avatar tone-c" style={{ width: 88, height: 88, fontSize: 28, overflow: "hidden", flexShrink: 0 }}>
              {talent.idPhotoFile?.viewUrl
                ? <img src={talent.idPhotoFile.viewUrl} alt={talent.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
                : <I.User className="avatar-placeholder" style={{ width: "56%", height: "56%", opacity: 0.9 }} aria-label="No photo" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 className="page-title" style={{ fontSize: 28, margin: 0 }}>{talent.name}</h1>
                {submissions.length > 1 && (
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
                    {submissions.length} submissions
                  </span>
                )}
                {stale && <span className="tag-pill talent-stale-pill">Stale — not contacted in 180+ days</span>}
              </div>
              <CollapsibleText
                text={talent.title}
                lines={2}
                style={{ fontSize: 15, color: "var(--ink-2)", marginTop: 6 }}
              />
              <div className="mono" style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                {talent.location || "Location not provided"}
                {talent.yearsExperienceLabel && talent.yearsExperienceLabel.length <= 80 && (
                  <> · {talent.yearsExperienceLabel}</>
                )}
              </div>
              {talent.yearsExperienceLabel && talent.yearsExperienceLabel.length > 80 && (
                <CollapsibleText
                  text={talent.yearsExperienceLabel}
                  lines={2}
                  style={{ fontSize: 12, color: "var(--muted)", fontFamily: "monospace", marginTop: 2 }}
                />
              )}
              {(talent.tags || []).length > 0 && (
                <div className="cluster" style={{ marginTop: 8, gap: 6 }}>
                  {talent.tags.map((tag) => <span key={tag} className="tag-pill talent-tag-pill">{tag}</span>)}
                </div>
              )}
              {/* ── Profile action row ── */}
              <div className="cps-profile-actions" style={{ marginTop: 12 }}>
                {/* Upload — only on document tabs, after docs loaded, when a field has no doc yet */}
                {activeFields.length > 0 && docTabReady && uploadableFields.length > 0 && (
                  <div style={{ position: "relative" }}>
                    <button
                      className="cps-action-btn"
                      title="Upload document"
                      onClick={() => {
                        if (uploadableFields.length === 1) {
                          triggerUpload(uploadableFields[0]);
                        } else {
                          setUploadDdOpen((v) => !v);
                        }
                      }}
                    >
                      <I.Upload style={{ width: 16, height: 16 }} />
                      <span>Upload</span>
                    </button>
                    {uploadDdOpen && uploadableFields.length > 1 && (
                      <>
                        <div className="menu-scrim" onClick={() => setUploadDdOpen(false)} />
                        <div className="menu cps-upload-dd">
                          {uploadableFields.map((f) => (
                            <button key={f} className="menu-item" onClick={() => triggerUpload(f)}>
                              {DOC_FIELD_CONFIG[f]?.icon} {DOC_FIELD_CONFIG[f]?.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {/* Message */}
                <window.CrmEmailActionButton
                  className="cps-action-btn"
                  title={talent.email ? `Email ${talent.email}` : "No email on file"}
                  email={talent.email}
                  name={talent.name}
                  sourceType="talent-pool"
                  sourceLabel="Talent Pool"
                  sourceId={talent.id}
                  subject={`Glondiasites - ${talent.name || "Talent Pool contact"}`}
                >
                  <I.Mail style={{ width: 16, height: 16 }} />
                  <span>Message</span>
                </window.CrmEmailActionButton>
                {/* Favorite */}
                <button
                  className={"cps-action-btn" + (isFavorite ? " is-starred" : "")}
                  title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                  onClick={onToggleFavorite}
                >
                  <I.Star style={{ width: 16, height: 16 }} />
                  <span>Favorite</span>
                </button>
                {/* Analysis */}
                <button
                  className="cps-action-btn"
                  title="Run AI analysis"
                  onClick={() => {
                    setAnalysisCheck({ talent, loading: true, existingRun: null });
                    window.HEYA_API.getTalentAnalysis(talent.id)
                      .then((data) => { setAnalysisCheck(null); setAnalysisModal({ talent, existingRun: data?.run || null }); })
                      .catch(() => { setAnalysisCheck(null); setAnalysisModal({ talent, existingRun: null }); });
                  }}
                >
                  <I.BarChart style={{ width: 16, height: 16 }} />
                  <span>Analysis</span>
                </button>
                {/* Research */}
                <button
                  className="cps-action-btn"
                  title="Run background research"
                  onClick={() => {
                    setRoxanneCheck({ talent, loading: true, existingRun: null });
                    window.HEYA_API.getTalentResearch(talent.id)
                      .then((d) => setRoxanneCheck((prev) => prev?.talent.id === talent.id ? { ...prev, loading: false, existingRun: d.run || null } : prev))
                      .catch(() => setRoxanneCheck((prev) => prev?.talent.id === talent.id ? { ...prev, loading: false } : prev));
                  }}
                >
                  <I.Globe style={{ width: 16, height: 16 }} />
                  <span>Research</span>
                </button>
              </div>
              {contactError && <div className="mono" style={{ fontSize: 11, color: "var(--danger)", marginTop: 6 }}>{contactError}</div>}
              {lastContacted && <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>Last contacted: {new Date(lastContacted).toLocaleDateString("en-PG")}</div>}
            </div>
          </div>

          {/* ── Tab panel ── */}
          <div className="cps-tab-panel">

            {profileTab === "overview" && (
              <div className="cps-panel-content talent-profile-body">
                <div className="stack" style={{ gap: 14 }}>
                  <Section title="Summary">
                    <CollapsibleText text={talent.headline} lines={4} style={{ lineHeight: 1.55, fontSize: 13 }} />
                  </Section>
                  <Section title="Preferred roles"><div>{talent.desiredRoles || "Not provided"}</div></Section>
                  <Section title="Preferred work location"><div>{talent.preferredWorkLocation || "Not provided"}</div></Section>
                  <Section title="Industries / skills">
                    <div className="cluster" style={{ flexWrap: "wrap", gap: 6 }}>
                      {(talent.skills || []).length
                        ? talent.skills.map((skill) => <span key={skill} className="tag-pill tag-needs-review">{skill}</span>)
                        : <span style={{ color: "var(--muted)" }}>Not provided</span>}
                    </div>
                  </Section>
                  {matchedPositions.length > 0 && (
                    <Section title="Matching open positions">
                      <div className="stack" style={{ gap: 8 }}>
                        {matchedPositions.map((pos) => (
                          <div key={pos.id} className="talent-match-row">
                            <div>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{pos.title}</div>
                              <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                                {pos.location || "Location not set"}{pos.department ? ` · ${pos.department}` : ""}
                              </div>
                            </div>
                            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#E7F6EE", color: "#1F7A4C", fontWeight: 600, flexShrink: 0 }}>
                              {pos.hits} match{pos.hits !== 1 ? "es" : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}
                  <Section title="Cover letter / notes">
                    <div style={{ whiteSpace: "pre-wrap" }}>{talent.coverLetterText || talent.additionalNotes || "Not provided"}</div>
                  </Section>
                </div>
                <div className="stack" style={{ gap: 14 }}>
                  <Section title="Contact">
                    <KVTalent k="Email" v={talent.email} />
                    <KVTalent k="Phone" v={talent.phone} />
                  </Section>
                  <Section title="Profile details">
                    <KVTalent k="Highest qualification" v={talent.highestQualification || talent.education} />
                    <KVTalent k="Availability" v={talent.availability} />
                    <KVTalent k="CV link" v={talent.cvLink} />
                    <KVTalent k="Cover letter link" v={talent.coverLetterLink} />
                  </Section>
                  <Section title="Engagement">
                    <KVTalent k="Last contacted" v={lastContacted ? new Date(lastContacted).toLocaleDateString("en-PG") : "Never"} />
                    <KVTalent k="Consent expires" v={talent.consentExpiresAt ? new Date(talent.consentExpiresAt).toLocaleDateString("en-PG") : "Not set"} />
                    <KVTalent k="Submitted" v={talent.createdAt ? new Date(talent.createdAt).toLocaleDateString("en-PG") : ""} />
                    <KVTalent k="Source" v={talent.source} />
                  </Section>
                </div>
              </div>
            )}

            {profileTab === "submissions" && (
              <div className="cps-panel-content stack" style={{ gap: 10 }}>
                {submissions.map((sub, idx) => {
                  const { bg, border } = sub.isPrimary
                    ? { bg: "#5B8DEF", border: "#2B5EBF" }
                    : subPalette[idx % subPalette.length];
                  return (
                    <div
                      key={sub.id}
                      className="cps-submission-row"
                      onClick={() => setActiveSubmission(sub)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && setActiveSubmission(sub)}
                    >
                      <div className="cps-submission-index" style={{ background: bg, color: "#fff", borderColor: border }}>
                        {sub.submissionIndex}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{sub.name || talent.name}</div>
                        <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                          {sub.submissionUid} · {sub.isPrimary ? "Primary" : "Additional submission"} · {sub.createdAt ? new Date(sub.createdAt).toLocaleDateString("en-PG") : "Unknown date"}
                        </div>
                      </div>
                      <I.ChevronRight style={{ width: 16, height: 16, color: "var(--muted)", flexShrink: 0 }} />
                    </div>
                  );
                })}
              </div>
            )}

            {profileTab === "cv" && (
              <div className="cps-panel-content stack" style={{ gap: 18 }}>
                {(talent.coverLetterText || talent.additionalNotes) && (
                  <Section title="Cover letter text">
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 13 }}>
                      {talent.coverLetterText || talent.additionalNotes}
                    </div>
                  </Section>
                )}
                <CpsDocumentTab
                  key={talent.id + "-cv"}
                  talent={talent}
                  fieldNames={["cv", "cover-letter"]}
                  sectionLabel="CV & Cover Letter"
                  uploadSignal={uploadSignal}
                  onDocCountChange={handleDocCount}
                  onReady={setDocTabReady}
                  onRegisterUploadTrigger={registerUploadTrigger}
                />
              </div>
            )}

            {profileTab === "police" && (
              <div className="cps-panel-content">
                <CpsDocumentTab key={talent.id + "-police"} talent={talent} fieldNames={["police-clearance"]} sectionLabel="Police Clearance" uploadSignal={uploadSignal} onDocCountChange={handleDocCount} onReady={setDocTabReady} onRegisterUploadTrigger={registerUploadTrigger} />
              </div>
            )}
            {profileTab === "medical" && (
              <div className="cps-panel-content">
                <CpsDocumentTab key={talent.id + "-medical"} talent={talent} fieldNames={["medical-doc"]} sectionLabel="Medical Records" uploadSignal={uploadSignal} onDocCountChange={handleDocCount} onReady={setDocTabReady} onRegisterUploadTrigger={registerUploadTrigger} />
              </div>
            )}
            {profileTab === "certs" && (
              <div className="cps-panel-content">
                <CpsDocumentTab key={talent.id + "-certs"} talent={talent} fieldNames={["certificate"]} sectionLabel="Certificates" uploadSignal={uploadSignal} onDocCountChange={handleDocCount} onReady={setDocTabReady} onRegisterUploadTrigger={registerUploadTrigger} />
              </div>
            )}
            {profileTab === "achievements" && (
              <div className="cps-panel-content">
                <CpsDocumentTab key={talent.id + "-achievements"} talent={talent} fieldNames={["achievement-doc"]} sectionLabel="Achievements" uploadSignal={uploadSignal} onDocCountChange={handleDocCount} onReady={setDocTabReady} onRegisterUploadTrigger={registerUploadTrigger} />
              </div>
            )}
            {profileTab === "analysis" && (
              <div className="cps-panel-content">
                <CpsAnalysisPanel talent={talent} positions={positions} />
              </div>
            )}
            {profileTab === "research" && (
              <div className="cps-panel-content">
                <CpsResearchPanel talent={talent} />
              </div>
            )}
            {profileTab === "jobfit" && (
              <div className="cps-panel-content">
                <CpsEmptyState icon="🎯" title="Job Fit" body="Job fit scoring against open positions will appear here once positions are matched to this candidate." />
              </div>
            )}
            {profileTab === "hrnotes" && (
              <div className="cps-panel-content">
                <CpsEmptyState icon="📝" title="HR Notes" body="Internal HR notes and interview feedback for this candidate will appear here." />
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

// ===== ADD TALENT MODAL =====

function SubmissionSheet({ submission: sub, onClose }) {
  const [closing, setClosing] = React.useState(false);

  function close() { setClosing(true); setTimeout(onClose, 260); }

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fmt = (iso) => iso ? new Date(iso).toLocaleString("en-PG") : "Not provided";
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("en-PG") : "Not provided";

  return (
    <div
      className={"roxanne-sheet-scrim" + (closing ? " is-closing" : "")}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <div className={"roxanne-sheet" + (closing ? " is-closing" : "")} style={{ maxWidth: 540 }}>
        <div className="roxanne-sheet__head">
          <div className="roxanne-sheet__head-left">
            <div>
              <div className="roxanne-sheet__name">Submission {sub.submissionIndex}</div>
              <div className="roxanne-sheet__title mono" style={{ fontSize: 11 }}>
                {sub.submissionUid}
              </div>
              <div className="roxanne-sheet__meta">
                <span>Submitted {fmtDate(sub.createdAt)}</span>
                {sub.updatedAt && sub.updatedAt !== sub.createdAt && <span>Updated {fmtDate(sub.updatedAt)}</span>}
              </div>
            </div>
          </div>
          <div className="roxanne-sheet__head-right">
            <span style={{ fontSize: 10, color: "var(--muted)", padding: "3px 8px", border: "1px solid var(--line)", borderRadius: 20 }}>
              {sub.isPrimary ? "Primary" : "Additional submission"}
            </span>
            <button className="icon-btn" onClick={close} title="Close"><I.X /></button>
          </div>
        </div>

        <div className="roxanne-sheet__body" style={{ padding: "16px 24px 28px" }}>
          <div className="stack" style={{ gap: 14 }}>

            <Section title="Identity">
              <KVTalent k="Submission UID" v={sub.submissionUid} />
              <KVTalent k="Applicant UID"  v={sub.applicantId || "Not linked"} />
              <KVTalent k="Submitted"      v={fmt(sub.createdAt)} />
              <KVTalent k="Last updated"   v={fmt(sub.updatedAt)} />
              <KVTalent k="Source"         v={sub.source || "Talent Pool"} />
            </Section>

            <Section title="Personal details">
              <KVTalent k="Name"     v={sub.name || "Not provided"} />
              <KVTalent k="Email"    v={sub.email || "Not provided"} />
              <KVTalent k="Phone"    v={sub.phone || "Not provided"} />
              <KVTalent k="Location" v={sub.location || "Not provided"} />
            </Section>

            <Section title="Professional">
              <KVTalent k="Desired roles"   v={sub.desiredRoles || "Not provided"} />
              <KVTalent k="Industries"      v={sub.industries || "Not provided"} />
              <KVTalent k="Key skills"      v={sub.keySkills || "Not provided"} />
              <KVTalent k="Experience"      v={sub.yearsExperienceLabel || "Not provided"} />
            </Section>

            {(sub.headline || sub.notes) && (
              <Section title="Summary / headline">
                <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.55 }}>{sub.headline || sub.notes}</div>
              </Section>
            )}

            {(sub.coverLetterText || sub.additionalNotes) && (
              <Section title="Cover letter / notes">
                <div style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.55 }}>
                  {sub.coverLetterText || sub.additionalNotes}
                </div>
              </Section>
            )}

            <Section title="Documents">
              <div className="cluster" style={{ gap: 8, flexWrap: "wrap" }}>
                {sub.cvFile?.downloadUrl
                  ? <a className="btn sm accent" href={sub.cvFile.downloadUrl} target="_blank" rel="noreferrer">Download CV</a>
                  : <span style={{ fontSize: 12, color: "var(--muted)" }}>No CV on file</span>}
                {sub.coverLetterFile?.downloadUrl && (
                  <a className="btn sm" href={sub.coverLetterFile.downloadUrl} target="_blank" rel="noreferrer">Cover Letter</a>
                )}
                {sub.idPhotoFile?.viewUrl && (
                  <a className="btn sm" href={sub.idPhotoFile.viewUrl} target="_blank" rel="noreferrer">ID Photo</a>
                )}
              </div>
              {sub.idPhotoFile?.viewUrl && (
                <img
                  src={sub.idPhotoFile.viewUrl}
                  alt="ID photo"
                  style={{ marginTop: 10, width: 80, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }}
                />
              )}
            </Section>

          </div>
        </div>
      </div>
    </div>
  );
}


function readFileAsUpload(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      // dataUrl = "data:<mime>;base64,<data>"
      const base64 = dataUrl.split(",")[1] || "";
      resolve({ name: file.name, type: file.type, contentBase64: base64 });
    };
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function TalentAddModal({ onCancel, onSave }) {
  const EMPTY = {
    fullName: "", email: "", phone: "",
    desiredRoles: "", currentLocation: "", yearsExperience: "",
    preferredWorkLocation: "", highestQualification: "",
    industries: "", keySkills: "", availability: "",
    source: "Manual entry",
    summary: "", additionalNotes: "",
  };
  const [draft, setDraft] = React.useState(EMPTY);
  const [cvFile, setCvFile] = React.useState(null);
  const [coverMode, setCoverMode] = React.useState("upload"); // "upload" | "write"
  const [coverFile, setCoverFile] = React.useState(null);
  const [coverText, setCoverText] = React.useState("");
  const [idPhotoFile, setIdPhotoFile] = React.useState(null);
  const [cvParsing, setCvParsing] = React.useState(false);
  const [parseMsg, setParseMsg] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function up(field, value) { setDraft((d) => ({ ...d, [field]: value })); }

  async function handleCvAutofill() {
    if (!cvFile) { setParseMsg("Upload a CV file first."); return; }
    setCvParsing(true);
    setParseMsg("");
    try {
      const upload = await readFileAsUpload(cvFile);
      const result = await window.HEYA_API.parseCvDocument({
        fileName: upload.name,
        mimeType: upload.type,
        contentBase64: upload.contentBase64
      });
      if (result?.ok && result.fields) {
        const f = result.fields;
        setDraft((d) => ({
          ...d,
          fullName: d.fullName || f.fullName || "",
          email: d.email || f.email || "",
          phone: d.phone || f.phone || "",
          desiredRoles: d.desiredRoles || f.desiredRoles || "",
          industries: d.industries || f.industries || "",
          keySkills: d.keySkills || f.keySkills || "",
          highestQualification: d.highestQualification || f.highestQualification || "",
          yearsExperience: d.yearsExperience || f.yearsExperience || "",
          currentLocation: d.currentLocation || f.currentLocation || "",
          preferredWorkLocation: d.preferredWorkLocation || f.preferredWorkLocation || "",
          availability: d.availability || f.availability || "",
          summary: d.summary || f.summary || "",
        }));
        setParseMsg("Fields filled from CV — review and adjust as needed.");
      } else {
        setParseMsg("Could not extract fields. Fill in manually.");
      }
    } catch (err) {
      setParseMsg("Parse failed: " + (err.message || "Unknown error"));
    } finally {
      setCvParsing(false);
    }
  }

  async function handleSave() {
    setError("");
    if (!draft.fullName.trim()) { setError("Full name is required."); return; }
    if (!draft.email.trim()) { setError("Email address is required."); return; }
    setSaving(true);
    try {
      const cvUpload = cvFile ? await readFileAsUpload(cvFile) : null;
      let coverLetterUpload = null;
      if (coverMode === "upload" && coverFile) {
        coverLetterUpload = await readFileAsUpload(coverFile);
      }
      const idPhotoUpload = idPhotoFile ? await readFileAsUpload(idPhotoFile) : null;
      const payload = {
        ...draft,
        message: draft.summary,
        coverLetterText: coverMode === "write" ? coverText : "",
        cvUpload,
        coverLetterUpload,
        idPhotoUpload,
        sourcePath: "/dashboard/talent-pool/manual-add",
      };
      await onSave(payload);
    } catch (err) {
      setError(err.message || "Could not save. Please try again.");
      setSaving(false);
    }
  }

  const sectionHead = (label) => (
    <div style={{ gridColumn: "1 / -1", borderBottom: "1px solid var(--line-2)", paddingBottom: 6, marginBottom: 2, marginTop: 8 }}>
      <span className="mono eyebrow">{label}</span>
    </div>
  );

  return (
    <div className="publish-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="edit-modal talent-add-modal" style={{ width: "min(860px, 95vw)" }}>
        <div className="edit-modal-head">
          <div>
            <div className="mono eyebrow">Talent Pool</div>
            <div className="edit-modal-title">Add talent manually</div>
          </div>
          <button className="icon-btn" onClick={onCancel} title="Close">✕</button>
        </div>

        <div className="edit-modal-body">
          <div className="form-grid">

            {sectionHead("Personal information")}

            <TalentField label="Full name *">
              <input className="ifield" placeholder="e.g. Jane Smith" value={draft.fullName} onChange={(e) => up("fullName", e.target.value)} />
            </TalentField>
            <TalentField label="Email address *">
              <input className="ifield" type="email" placeholder="jane@example.com" value={draft.email} onChange={(e) => up("email", e.target.value)} />
            </TalentField>
            <TalentField label="Phone">
              <input className="ifield" placeholder="+675 xxx xxxx" value={draft.phone} onChange={(e) => up("phone", e.target.value)} />
            </TalentField>
            <TalentField label="Source">
              <select className="ifield" value={draft.source} onChange={(e) => up("source", e.target.value)}>
                <option>Manual entry</option>
                <option>Referral</option>
                <option>LinkedIn</option>
                <option>Job board</option>
                <option>Direct approach</option>
                <option>Walk-in</option>
                <option>Past applicant</option>
                <option>Other</option>
              </select>
            </TalentField>

            {sectionHead("Professional profile")}

            <TalentField label="Desired role(s) / Job title">
              <input className="ifield" placeholder="e.g. Senior Mechanical Engineer" value={draft.desiredRoles} onChange={(e) => up("desiredRoles", e.target.value)} />
            </TalentField>
            <TalentField label="Industries">
              <input className="ifield" placeholder="e.g. Mining, Construction, Oil & Gas" value={draft.industries} onChange={(e) => up("industries", e.target.value)} />
            </TalentField>
            <TalentField label="Key skills">
              <input className="ifield" placeholder="Comma-separated — e.g. Safety, FIFO, Supervision" value={draft.keySkills} onChange={(e) => up("keySkills", e.target.value)} />
            </TalentField>
            <TalentField label="Highest qualification">
              <input className="ifield" placeholder="e.g. Bachelor of Engineering" value={draft.highestQualification} onChange={(e) => up("highestQualification", e.target.value)} />
            </TalentField>
            <TalentField label="Years of experience">
              <select className="ifield" value={draft.yearsExperience} onChange={(e) => up("yearsExperience", e.target.value)}>
                <option value="">— Select —</option>
                <option>Less than 1 year</option>
                <option>1–2 years</option>
                <option>3–5 years</option>
                <option>6–10 years</option>
                <option>10–15 years</option>
                <option>15+ years</option>
              </select>
            </TalentField>
            <TalentField label="Availability">
              <select className="ifield" value={draft.availability} onChange={(e) => up("availability", e.target.value)}>
                <option value="">— Select —</option>
                <option>Open to work — immediately available</option>
                <option>Available in 2–4 weeks</option>
                <option>Available in 1–3 months</option>
                <option>Passively looking</option>
                <option>Not currently looking</option>
              </select>
            </TalentField>

            {sectionHead("Location")}

            <TalentField label="Current location">
              <input className="ifield" placeholder="e.g. Port Moresby, NCD" value={draft.currentLocation} onChange={(e) => up("currentLocation", e.target.value)} />
            </TalentField>
            <TalentField label="Preferred work location">
              <input className="ifield" placeholder="e.g. FIFO, Lae, Open to relocation" value={draft.preferredWorkLocation} onChange={(e) => up("preferredWorkLocation", e.target.value)} />
            </TalentField>

            {sectionHead("Summary & notes")}

          </div>

          <div style={{ marginTop: 12 }}>
            <TalentField label="Professional summary">
              <textarea className="ifield" rows="4" placeholder="Brief background, strengths, what makes this candidate stand out..." value={draft.summary} onChange={(e) => up("summary", e.target.value)} />
            </TalentField>
          </div>
          <div style={{ marginTop: 12 }}>
            <TalentField label="Internal notes">
              <textarea className="ifield" rows="3" placeholder="Any internal notes, referral context, next steps..." value={draft.additionalNotes} onChange={(e) => up("additionalNotes", e.target.value)} />
            </TalentField>
          </div>

          {/* Documents */}
          <div style={{ borderBottom: "1px solid var(--line-2)", paddingBottom: 6, marginTop: 20, marginBottom: 12 }}>
            <span className="mono eyebrow">Documents</span>
          </div>

          <div className="form-grid">
            <TalentField label="CV / Resume (PDF, DOC, DOCX, TXT)">
              <input
                className="ifield"
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                style={{ paddingTop: 6 }}
                onChange={(e) => setCvFile(e.target.files[0] || null)}
              />
              {cvFile && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <div className="mono" style={{ fontSize: 11, color: "var(--success)", flex: 1 }}>✓ {cvFile.name}</div>
                  <button
                    className="btn accent sm"
                    type="button"
                    onClick={handleCvAutofill}
                    disabled={cvParsing}
                    style={{ fontSize: 11, padding: "3px 10px", flexShrink: 0 }}
                  >{cvParsing ? "Parsing..." : "Auto-fill from CV"}</button>
                </div>
              )}
              {parseMsg && (
                <div className="mono" style={{ fontSize: 11, color: parseMsg.startsWith("Fields") ? "var(--success)" : "var(--error)", marginTop: 4 }}>{parseMsg}</div>
              )}
            </TalentField>

            <TalentField label="ID photo (JPG, PNG)">
              <input
                className="ifield"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ paddingTop: 6 }}
                onChange={(e) => setIdPhotoFile(e.target.files[0] || null)}
              />
              {idPhotoFile && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <img
                    src={URL.createObjectURL(idPhotoFile)}
                    alt="ID preview"
                    style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--line)" }}
                  />
                  <div className="mono" style={{ fontSize: 11, color: "var(--success)" }}>✓ {idPhotoFile.name}</div>
                </div>
              )}
            </TalentField>

            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <label className="mono" style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Cover letter</label>
                <div className="cluster" style={{ gap: 0, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 7, overflow: "hidden", padding: 2 }}>
                  <button
                    className={"btn sm" + (coverMode === "upload" ? " primary" : "")}
                    style={{ borderRadius: 5, padding: "2px 10px", fontSize: 11 }}
                    onClick={() => setCoverMode("upload")}
                    type="button"
                  >Upload file</button>
                  <button
                    className={"btn sm" + (coverMode === "write" ? " primary" : "")}
                    style={{ borderRadius: 5, padding: "2px 10px", fontSize: 11 }}
                    onClick={() => setCoverMode("write")}
                    type="button"
                  >Write</button>
                </div>
              </div>
              {coverMode === "upload" ? (
                <>
                  <input
                    className="ifield"
                    type="file"
                    accept=".pdf,.doc,.docx,.rtf,.txt"
                    style={{ paddingTop: 6 }}
                    onChange={(e) => setCoverFile(e.target.files[0] || null)}
                  />
                  {coverFile && <div className="mono" style={{ fontSize: 11, color: "var(--success)", marginTop: 4 }}>✓ {coverFile.name}</div>}
                </>
              ) : (
                <textarea
                  className="ifield"
                  rows="5"
                  placeholder="Write the cover letter here..."
                  value={coverText}
                  onChange={(e) => setCoverText(e.target.value)}
                />
              )}
            </div>
          </div>

          {error && (
            <div className="inbox-action-status is-error" style={{ marginTop: 16 }}>{error}</div>
          )}
        </div>

        <div className="edit-modal-foot">
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Entry will appear in the talent pool immediately.
          </span>
          <div className="cluster">
            <button className="btn" onClick={onCancel} disabled={saving}>Cancel</button>
            <button className="btn primary" onClick={handleSave} disabled={saving}>
              {saving ? "Adding..." : "Add to pool"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function initialsFor(name = "") {
  return String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "TP";
}

function Section({ title, children }) {
  return (
    <div className="profile-section">
      <div className="mono eyebrow" style={{ marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function TalentField({ label, children }) {
  return (
    <label className="inbox-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function KVTalent({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "6px 0", borderBottom: "1px solid var(--line-2)" }}>
      <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{k}</span>
      <span style={{ fontSize: 13, textAlign: "right" }}>{v || <em style={{ color: "var(--muted)", fontStyle: "normal" }}>-</em>}</span>
    </div>
  );
}

// ===== PROFILE ANALYSIS =====

function AnalysisConfirmModal({ talent, existingRun, onCancel, onViewPrevious, onRunNew }) {
  const [instructions, setInstructions] = React.useState("");
  const [showInstructions, setShowInstructions] = React.useState(!existingRun);
  const hasExisting = Boolean(existingRun);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="publish-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="roxanne-confirm">
        <div className="roxanne-confirm__logo" style={{ color: "#4F7EF7" }}>
          <I.BarChart style={{ width: 18, height: 18 }} />
          <span>Profile Analysis</span>
        </div>

        {hasExisting ? (
          <>
            <div className="roxanne-confirm__title">Analysis already on file</div>
            <div className="roxanne-confirm__body">
              <strong>{talent.name || "This candidate"}</strong> has a previous analysis
              {existingRun.completedAt ? ` from ${new Date(existingRun.completedAt).toLocaleDateString()}` : ""}.
              Would you like to view it, or run a fresh analysis?
            </div>
            {showInstructions && (
              <div style={{ marginTop: 12 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: 6 }}>
                  Focus instructions for new analysis (optional)
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Analyse for mining shutdown roles, leadership signals, safety mindset…"
                  rows={3}
                  style={{ width: "100%", resize: "vertical", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }}
                />
              </div>
            )}
            <div className="roxanne-confirm__note">
              Running a new analysis will not delete the previous one.
            </div>
            <div className="roxanne-confirm__actions" style={{ flexWrap: "wrap", gap: 8 }}>
              <button className="btn" onClick={onCancel}>Cancel</button>
              <button className="btn" onClick={onViewPrevious}>
                View Previous
              </button>
              {showInstructions ? (
                <button className="btn" style={{ background: "#4F7EF7", color: "#fff", border: "none" }} onClick={() => onRunNew(instructions.trim())}>
                  <I.BarChart style={{ width: 13, height: 13 }} />
                  Run New Analysis
                </button>
              ) : (
                <button className="btn ghost sm" style={{ fontSize: 12 }} onClick={() => setShowInstructions(true)}>
                  Run New Analysis…
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="roxanne-confirm__title">Analyse this candidate?</div>
            <div className="roxanne-confirm__body">
              Glondiasites analysis engine will evaluate <strong>{talent.name || "this candidate"}</strong>'s submitted profile, CV, and cover letter data — extracting skills, signals, gaps, and suggested opportunities.
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: 6 }}>
                Focus instructions (optional)
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Analyse for mining shutdown roles, leadership signals, safety mindset…"
                rows={3}
                style={{ width: "100%", resize: "vertical", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }}
              />
            </div>
            <div className="roxanne-confirm__note">
              Analysis uses only submitted Glondiasites profile data. Results are a recruiter starting point — not a final hiring assessment.
            </div>
            <div className="roxanne-confirm__actions">
              <button className="btn" onClick={onCancel}>Cancel</button>
              <button className="btn" style={{ background: "#4F7EF7", color: "#fff", border: "none" }} onClick={() => onRunNew(instructions.trim())}>
                <I.BarChart style={{ width: 13, height: 13 }} />
                Run Analysis
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AnalysisSheet({ talent, initialRun, mode = "view", instructions = "", positions = [], onClose }) {
  const [tab, setTab] = React.useState("summary");
  const [closing, setClosing] = React.useState(false);
  const [run, setRun] = React.useState(initialRun || null);
  const [loading, setLoading] = React.useState(
    !initialRun || initialRun.status === "queued" || initialRun.status === "running"
  );
  const [polling, setPolling] = React.useState(false);
  const [error, setError] = React.useState(
    initialRun?.status === "failed"
      ? (initialRun.error || "Analysis failed.")
      : null
  );
  const tones = ["tone-a", "tone-b", "tone-c", "tone-d"];
  const tone = tones[(talent.name || "").charCodeAt(0) % tones.length];
  const pollRef = React.useRef(null);

  function handleClose() {
    clearInterval(pollRef.current);
    setClosing(true);
    setTimeout(onClose, 280);
  }

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearInterval(pollRef.current); };
  }, []);

  function applyRun(r) {
    setRun(r);
    if (!r) { setError("No result returned."); setLoading(false); return; }
    if (r.status === "failed") {
      const msg = r.error || "Analysis failed.";
      setError(msg.includes("401") || msg.includes("Incorrect API key")
        ? "OpenAI API key is invalid or has expired. Update OPENAI_API_KEY in .env and restart the server."
        : msg);
      setLoading(false);
    } else if (r.status === "completed") {
      setError(null);
      setLoading(false);
    }
    // queued/running — keep loading spinner, polling handles update
  }

  function startPolling(runId) {
    clearInterval(pollRef.current);
    setPolling(true);
    pollRef.current = setInterval(() => {
      fetch(`/api/admin/careers/talent-pool/${talent.id}/analysis/${runId}`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.ok || !data.run) return;
          applyRun(data.run);
          if (data.run.status !== "queued" && data.run.status !== "running") {
            clearInterval(pollRef.current);
            setPolling(false);
          }
        })
        .catch(() => {});
    }, 3000);
  }

  // On mount: if the initial run is still active, start polling it
  React.useEffect(() => {
    if (initialRun && (initialRun.status === "queued" || initialRun.status === "running")) {
      startPolling(initialRun.id);
    }
  }, []);

  function handleRerun() {
    setLoading(true);
    setError(null);
    window.HEYA_API.runTalentAnalysis(talent.id, { instructions, force: true })
      .then((data) => {
        applyRun(data.run);
        if (data.run && (data.run.status === "queued" || data.run.status === "running")) {
          startPolling(data.run.id);
        }
      })
      .catch((err) => { setError(err.message || "Analysis failed."); setLoading(false); });
  }

  const handleRunAgain = handleRerun;

  const tabs = [
    { id: "summary",    label: "Summary" },
    { id: "skills",     label: "Skills & Experience" },
    { id: "signals",    label: "Work Style Signals" },
    { id: "gaps",       label: "Gaps & Questions" },
    { id: "opps",       label: "Opportunities" },
  ];

  const result = run?.result || null;
  const completedButEmpty = !loading && !error && run?.status === "completed" && !result?.summary;

  return (
    <div className={"roxanne-sheet-scrim" + (closing ? " is-closing" : "")} onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className={"roxanne-sheet" + (closing ? " is-closing" : "")}>
        <div className="roxanne-sheet__head">
          <div className="roxanne-sheet__head-left">
            <div className={"avatar " + tone} style={{ width: 56, height: 56, overflow: "hidden", flexShrink: 0 }}>
              {talent.idPhotoFile?.viewUrl
                ? <img src={talent.idPhotoFile.viewUrl} alt={talent.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
                : <I.User className="avatar-placeholder" style={{ width: "56%", height: "56%", opacity: 0.9 }} />}
            </div>
            <div>
              <div className="roxanne-sheet__name">{talent.name || "Unknown"}</div>
              <div className="roxanne-sheet__title">{talent.title || "No title on record"}</div>
              <div className="roxanne-sheet__meta">
                {talent.location && <span>📍 {talent.location}</span>}
                {talent.yearsExperienceLabel && <span>⏱ {talent.yearsExperienceLabel}</span>}
                {run?.completedAt && <span style={{ color: "var(--muted)", fontSize: 11 }}>Last run {new Date(run.completedAt).toLocaleString()}</span>}
              </div>
            </div>
          </div>
          <div className="roxanne-sheet__head-right">
            <div className="roxanne-ai-badge" style={{ background: "#4F7EF7" }}>
              <I.BarChart style={{ width: 12, height: 12 }} />
              Profile Analysis
            </div>
            {!loading && (
              <button className="btn ghost sm" style={{ fontSize: 12 }} onClick={handleRunAgain} title="Run analysis again">
                ↻ Re-run
              </button>
            )}
            <button className="icon-btn" onClick={handleClose} title="Close"><I.X /></button>
          </div>
        </div>

        {loading && (
          <CubeLoader
            label={run?.status === "running" ? "Analysing candidate profile…" : "Queuing analysis…"}
            sublabel="This usually takes 10–20 seconds. Results will appear automatically."
          />
        )}

        {!loading && error && (
          <div style={{ padding: "32px", margin: "16px 24px", background: "#fdf0f0", border: "1px solid #e05252", borderRadius: 12, color: "#c0392b", fontSize: 13 }}>
            <strong>Analysis failed:</strong> {error}
            <div style={{ marginTop: 12 }}>
              <button className="btn ghost sm" onClick={handleRunAgain}>Try again</button>
            </div>
          </div>
        )}

        {!loading && run?.status === "failed" && !error && (
          <div style={{ padding: "32px", margin: "16px 24px", background: "#fdf0f0", border: "1px solid #e05252", borderRadius: 12, color: "#c0392b", fontSize: 13 }}>
            <strong>Analysis failed:</strong> {run.error || "Unknown error."}
            <div style={{ marginTop: 12 }}>
              <button className="btn ghost sm" onClick={handleRunAgain}>Try again</button>
            </div>
          </div>
        )}

        {completedButEmpty && (
          <div style={{ padding: "32px", margin: "16px 24px", background: "#fffbe6", border: "1px solid #f5a623", borderRadius: 12, color: "#7a5800", fontSize: 13 }}>
            <strong>Analysis completed, but no usable data was returned.</strong>
            <div style={{ marginTop: 6, lineHeight: 1.6 }}>
              This usually means the CV or cover letter could not be extracted (e.g. scanned PDF), or the AI returned an empty response. Try running the analysis again, or check whether the candidate's documents are readable.
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn ghost sm" onClick={handleRunAgain}>Run again</button>
            </div>
          </div>
        )}

        {!loading && result && result.summary && (
          <>
            <div className="roxanne-sheet__tabs">
              {tabs.map((t) => (
                <button key={t.id} className={"roxanne-tab" + (tab === t.id ? " is-active analysis-tab-active" : "")} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="roxanne-sheet__body">
              {tab === "summary"  && <AnalysisSummaryTab result={result} talent={talent} run={run} />}
              {tab === "skills"   && <AnalysisSkillsTab result={result} talent={talent} positions={positions} />}
              {tab === "signals"  && <AnalysisSignalsTab result={result} />}
              {tab === "gaps"     && <AnalysisGapsAiTab result={result} />}
              {tab === "opps"     && <AnalysisOppsTab result={result} talent={talent} positions={positions} />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AnalysisSummaryTab({ result, talent, run }) {
  const scores = result.scores || {};
  const scoreItems = [
    { label: "Profile Completeness", value: scores.profileCompleteness, color: "#4F7EF7" },
    { label: "Skills Depth",         value: scores.skillsDepth,         color: "#2DC88A" },
    { label: "Experience Signal",    value: scores.experienceSignal,    color: "#9B59B6" },
    { label: "Contact Reliability",  value: scores.contactReliability,  color: "#F5A623" },
    { label: "Placement Readiness",  value: scores.placementReadiness,  color: "#E05252" },
  ].filter((s) => s.value != null);

  return (
    <>
      {result.summary && (
        <div className="rox-analysis-box" style={{ borderColor: "#4F7EF7", background: "linear-gradient(135deg, #EEF3FF 0%, var(--paper) 100%)" }}>
          <div className="rox-analysis-title" style={{ color: "#4F7EF7" }}><I.Spark style={{ width: 14, height: 14 }} /> AI Summary</div>
          <div className="rox-analysis-body">{result.summary}</div>
        </div>
      )}

      {scoreItems.length > 0 && (
        <div>
          <div className="rox-section-title">Scores</div>
          <div className="rox-score-row">
            {scoreItems.map((s) => (
              <div key={s.label} className="rox-score-card">
                <div className="rox-score-value" style={{ color: s.color }}>{s.value}</div>
                <div className="rox-score-label">{s.label}</div>
                <div className="rox-score-bar"><div className="rox-score-bar-fill" style={{ width: s.value + "%", background: s.color }}></div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {run?.confidence != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--paper)", fontSize: 13 }}>
          <span style={{ color: "var(--muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>AI Confidence</span>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.round(run.confidence * 100)}%`, background: "#4F7EF7", borderRadius: 3 }}></div>
          </div>
          <span style={{ fontWeight: 700 }}>{Math.round(run.confidence * 100)}%</span>
        </div>
      )}

      <div className="rox-analysis-box" style={{ background: "var(--bg)", border: "1px dashed var(--line)" }}>
        <div className="rox-analysis-title" style={{ color: "var(--muted)" }}><I.BarChart style={{ width: 13, height: 13 }} /> About Profile Analysis</div>
        <div className="rox-analysis-body" style={{ color: "var(--muted)", fontSize: 12 }}>
          This analysis is based only on submitted Glondiasites profile, CV, and cover letter data. It is a starting point for recruiter review — not a final hiring decision. All signals should be verified through direct candidate engagement.
        </div>
      </div>
    </>
  );
}

function AnalysisSkillsTab({ result, talent, positions }) {
  const skills = result.skills || [];
  const expAreas = result.experienceAreas || [];
  const education = result.educationTraining || [];
  const matched = getTalentPositionMatches(talent, positions);

  return (
    <>
      {skills.length > 0 && (
        <div>
          <div className="rox-section-title">Skills Identified</div>
          <div className="rox-skills">
            {skills.map((s) => <span key={s} className="rox-skill-chip">{s}</span>)}
          </div>
        </div>
      )}

      {expAreas.length > 0 && (
        <div>
          <div className="rox-section-title">Experience Areas</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {expAreas.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "9px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--paper)", fontSize: 13 }}>
                <div style={{ width: 5, borderRadius: 3, background: "#4F7EF7", flexShrink: 0, alignSelf: "stretch" }}></div>
                <span>{a}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {education.length > 0 && (
        <div>
          <div className="rox-section-title">Education / Training</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {education.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "9px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--paper)", fontSize: 13 }}>
                <div style={{ width: 5, borderRadius: 3, background: "var(--accent)", flexShrink: 0, alignSelf: "stretch" }}></div>
                <span>{e}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {matched.length > 0 && (
        <div>
          <div className="rox-section-title">Live Position Matches ({matched.length})</div>
          <div className="rox-timeline">
            {matched.map((pos, i) => {
              const fitPct = Math.max(40, 95 - i * 12);
              return (
                <div key={pos.id} className="rox-timeline-item" style={{ gap: 14, alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <div className="rox-timeline-company">{pos.title}</div>
                    <div className="rox-timeline-role">{pos.location || "Location not set"}{pos.department ? " · " + pos.department : ""}</div>
                    <div className="rox-timeline-period">{pos.hits} keyword match{pos.hits !== 1 ? "es" : ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: fitPct > 75 ? "#2DC88A" : "#F5A623" }}>{fitPct}%</div>
                    <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase" }}>Fit</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function AnalysisSignalsTab({ result }) {
  const signals = result.workStyleSignals || [];
  const strengths = result.possibleStrengths || [];

  return (
    <>
      {strengths.length > 0 && (
        <div>
          <div className="rox-section-title">Possible Strengths</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {strengths.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--paper)" }}>
                <div style={{ width: 5, borderRadius: 3, background: "#2DC88A", flexShrink: 0, alignSelf: "stretch" }}></div>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink)" }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {signals.length > 0 && (
        <div>
          <div className="rox-section-title">Work-Style Signals</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {signals.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--paper)" }}>
                <div style={{ width: 5, borderRadius: 3, background: "#9B59B6", flexShrink: 0, alignSelf: "stretch" }}></div>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink)" }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {strengths.length === 0 && signals.length === 0 && (
        <div className="analytics-empty-note">No work-style signals detected — profile may lack cover letter or detailed notes.</div>
      )}

      <div className="rox-analysis-box" style={{ borderColor: "#9B59B6" }}>
        <div className="rox-analysis-title" style={{ color: "#9B59B6" }}>⚠ Recruiter Note</div>
        <div className="rox-analysis-body">
          Work-style signals are inferred from submitted text and profile data only. They are possible indicators — not confirmed personality traits. Always verify through direct candidate engagement and structured interview.
        </div>
      </div>
    </>
  );
}

function AnalysisGapsAiTab({ result }) {
  const gaps = result.gaps || [];
  const questions = result.followUpQuestions || [];
  const caveats = result.caveats || [];
  const sevColor = { high: "#E05252", medium: "#F5A623", low: "#9B59B6" };
  const sevBg    = { high: "#fdf0f0", medium: "#fef9ed", low: "#f5f0fe" };

  return (
    <>
      {gaps.length > 0 ? (
        <div>
          <div className="rox-section-title">Profile Gaps ({gaps.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {gaps.map((g, i) => {
              const sev = (g.severity || "low").toLowerCase();
              return (
                <div key={i} style={{ display: "flex", gap: 12, padding: "10px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: sevBg[sev] || "var(--paper)" }}>
                  <div style={{ width: 4, borderRadius: 2, background: sevColor[sev] || "var(--muted)", flexShrink: 0, alignSelf: "stretch" }}></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: sevColor[sev] || "var(--ink)" }}>{g.label || g}</span>
                      {g.severity && <span style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "1px 6px", borderRadius: 3, background: sevColor[sev], color: "#fff" }}>{sev}</span>}
                    </div>
                    {g.detail && <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>{g.detail}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ border: "1px solid #2DC88A", borderRadius: 12, padding: "16px 20px", background: "#edfaf3", color: "#1a7a4a", fontSize: 13, marginBottom: 16 }}>
          ✓ No critical profile gaps detected by the analysis engine.
        </div>
      )}

      {questions.length > 0 && (
        <div>
          <div className="rox-section-title">Suggested Follow-Up Questions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {questions.map((q, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--paper)", fontSize: 13 }}>
                <span style={{ color: "#4F7EF7", fontWeight: 700, flexShrink: 0 }}>Q{i + 1}</span>
                <span style={{ lineHeight: 1.5 }}>{q}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {caveats.length > 0 && (
        <div>
          <div className="rox-section-title">Caveats</div>
          {caveats.map((c, i) => (
            <div key={i} className="rox-analysis-box" style={{ borderColor: "#F5A623", marginBottom: 8 }}>
              <div className="rox-analysis-body" style={{ fontSize: 12 }}>⚠ {c}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function AnalysisOppsTab({ result, talent, positions }) {
  const opps = result.suggestedOpportunities || [];
  const matched = getTalentPositionMatches(talent, positions);

  return (
    <>
      {opps.length > 0 && (
        <div>
          <div className="rox-section-title">AI-Suggested Opportunities</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {opps.map((o, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--paper)" }}>
                <div style={{ width: 5, borderRadius: 3, background: "#4F7EF7", flexShrink: 0, alignSelf: "stretch" }}></div>
                <span style={{ fontSize: 13, lineHeight: 1.5 }}>{o}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {matched.length > 0 && (
        <div>
          <div className="rox-section-title">Live Position Matches</div>
          <div className="rox-timeline">
            {matched.map((pos, i) => (
              <div key={pos.id} className="rox-timeline-item" style={{ gap: 14, alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <div className="rox-timeline-company">{pos.title}</div>
                  <div className="rox-timeline-role">{pos.location || "No location"}</div>
                  <div className="rox-timeline-period">{pos.hits} keyword match{pos.hits !== 1 ? "es" : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {opps.length === 0 && matched.length === 0 && (
        <div className="analytics-empty-note">No specific opportunities identified — profile may be incomplete.</div>
      )}
    </>
  );
}

// ===== ROXANNE AI =====

function RoxanneCheckModal({ talent, loading, existingRun, onCancel, onView, onRunNew }) {
  const [showNew, setShowNew] = React.useState(false);
  const [instructions, setInstructions] = React.useState("");
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const hasExisting = !loading && existingRun && existingRun.status !== "failed";
  const noExisting  = !loading && (!existingRun || existingRun.status === "failed");

  return (
    <div className="publish-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="roxanne-confirm">
        <div className="roxanne-confirm__logo">
          <I.Globe style={{ width: 18, height: 18 }} />
          <span>Public Research</span>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--muted)", fontSize: 13 }}>
            Checking for existing research…
          </div>
        )}

        {hasExisting && !showNew && (
          <>
            <div className="roxanne-confirm__title">Research already on file</div>
            <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 10, padding: "14px 16px", marginBottom: 12, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>{talent.name || "This candidate"}</div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>
                Last run: {new Date(existingRun.completedAt || existingRun.createdAt).toLocaleString()}
                {existingRun.model && <span style={{ marginLeft: 8, background: "var(--line-2)", borderRadius: 4, padding: "1px 6px" }}>{existingRun.model}</span>}
              </div>
              {existingRun.summary && (
                <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55, borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 4 }}>
                  {existingRun.summary.slice(0, 200)}{existingRun.summary.length > 200 ? "…" : ""}
                </div>
              )}
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)" }}>
                {(existingRun.result && existingRun.result.sources && existingRun.result.sources.length > 0)
                  ? `${existingRun.result.sources.length} source(s) found across LinkedIn, Facebook, and web.`
                  : "No public sources found in previous run."}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="btn accent" onClick={onView} style={{ width: "100%", justifyContent: "center" }}>
                <I.Globe style={{ width: 13, height: 13 }} /> View Previous Research
              </button>
              <button className="btn ghost" onClick={() => setShowNew(true)} style={{ width: "100%", justifyContent: "center", fontSize: 12 }}>
                Run New Search
              </button>
            </div>
            <div style={{ marginTop: 10 }} className="roxanne-confirm__actions">
              <button className="btn" onClick={onCancel}>Cancel</button>
            </div>
          </>
        )}

        {(noExisting || showNew) && (
          <>
            <div className="roxanne-confirm__title">
              {showNew ? "Run new research" : "Research this profile publicly?"}
            </div>
            <div className="roxanne-confirm__body">
              The research engine will search LinkedIn, Facebook, and public web sources for background context on <strong>{talent.name || "this person"}</strong>.
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted)", marginBottom: 6 }}>
                Research focus (optional)
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Focus on LinkedIn presence and mining industry background…"
                rows={3}
                style={{ width: "100%", resize: "vertical", fontSize: 13, padding: "8px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }}
              />
            </div>
            <div className="roxanne-confirm__note">
              Only publicly available information is used. This is not a formal background check.
            </div>
            <div className="roxanne-confirm__actions">
              <button className="btn" onClick={showNew ? () => setShowNew(false) : onCancel}>
                {showNew ? "← Back" : "Cancel"}
              </button>
              <button className="btn accent" onClick={() => onRunNew(instructions.trim())}>
                <I.Globe style={{ width: 13, height: 13 }} /> Run Research
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const SOURCE_TYPE_COLORS  = { linkedin: "#0077B5", facebook: "#1877F2", twitter: "#1DA1F2", instagram: "#E1306C", company: "#2DC88A", training: "#F5A623", news: "#E05252", web: "#7B61FF", other: "#888" };
const SOURCE_TYPE_LABELS  = { linkedin: "LinkedIn", facebook: "Facebook", twitter: "Twitter/X", instagram: "Instagram", company: "Company", training: "Training", news: "News", web: "Web", other: "Other" };

function RefChip({ refs, sources }) {
  if (!refs || !refs.length) return null;
  return (
    <span style={{ display: "inline-flex", gap: 3, marginLeft: 6, verticalAlign: "middle" }}>
      {refs.map((r) => {
        const src = (sources || []).find((s) => s.ref === r);
        return src && src.url
          ? <a key={r} href={src.url} target="_blank" rel="noopener noreferrer"
               title={src.title || src.url}
               style={{ fontSize: 10, fontWeight: 700, background: "var(--accent)", color: "#fff", borderRadius: 4, padding: "1px 5px", textDecoration: "none", lineHeight: 1.6 }}>[{r}]</a>
          : <span key={r} style={{ fontSize: 10, fontWeight: 700, background: "var(--line-2)", color: "var(--muted)", borderRadius: 4, padding: "1px 5px", lineHeight: 1.6 }}>[{r}]</span>;
      })}
    </span>
  );
}

function FindingRow({ text, refs, sources, accentColor }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--paper)", alignItems: "flex-start" }}>
      <div style={{ width: 4, borderRadius: 3, background: accentColor || "var(--accent)", flexShrink: 0, alignSelf: "stretch", minHeight: 20 }} />
      <span style={{ fontSize: 13, lineHeight: 1.55, flex: 1 }}>
        {text}<RefChip refs={refs} sources={sources} />
      </span>
    </div>
  );
}

function CubeLoader({ label, sublabel }) {
  const cube = (
    <div className="cube">
      <div className="side"></div><div className="side"></div><div className="side"></div>
      <div className="side"></div><div className="side"></div><div className="side"></div>
    </div>
  );
  const cubes = Array.from({ length: 63 }, (_, i) => React.cloneElement(cube, { key: i }));
  return (
    <div className="cube-loader-wrap">
      <div className="loader">
        <div className="cubes">{cubes}</div>
      </div>
      {(label || sublabel) && (
        <div className="cube-loader-label">
          {label && <div style={{ fontWeight: 600, color: "var(--ink-2)", marginBottom: 3 }}>{label}</div>}
          {sublabel && <div>{sublabel}</div>}
        </div>
      )}
    </div>
  );
}

const STRENGTH_STYLE = {
  confirmed: { bg: "#e8f9f2", border: "#2DC88A", text: "#1a7a55", label: "Confirmed" },
  likely:    { bg: "#e8f0fb", border: "#0077B5", text: "#0055a4", label: "Likely" },
  possible:  { bg: "#fff8e8", border: "#F5A623", text: "#a06000", label: "Possible" },
  weak:      { bg: "#f5f5f5", border: "#aaa",    text: "#666",    label: "Weak" },
  rejected:  { bg: "#fdf0f0", border: "#E05252", text: "#a02020", label: "Rejected" },
};

function SourceCard({ s, i, showRejectedNote }) {
  const color   = SOURCE_TYPE_COLORS[s.type] || SOURCE_TYPE_COLORS.other;
  const label   = SOURCE_TYPE_LABELS[s.type] || "Web";
  const refNum  = s.ref != null ? s.ref : i + 1;
  const ss      = STRENGTH_STYLE[s.matchStrength] || null;
  const isRejected = s.matchStrength === "rejected";
  return (
    <div style={{ border: `1px solid ${ss ? ss.border : "var(--line-2)"}`, borderRadius: 12, overflow: "hidden", background: ss ? ss.bg : "var(--paper)", opacity: isRejected ? 0.85 : 1 }}>
      {s.image && (
        <div style={{ height: 120, background: "var(--bg)", overflow: "hidden" }}>
          <img src={s.image} alt={s.title} style={{ width: "100%", height: "100%", objectFit: "cover" }}
               onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }} />
        </div>
      )}
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--muted)", flexShrink: 0, paddingTop: 3 }}>[{refNum}]</span>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", padding: "2px 7px", borderRadius: 4, background: color, color: "#fff", flexShrink: 0, letterSpacing: "0.04em" }}>{label}</span>
          {ss && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: ss.border + "25", color: ss.text, border: `1px solid ${ss.border}60`, flexShrink: 0 }}>{ss.label}</span>
          )}
          {s.matchScore != null && (
            <span style={{ fontSize: 10, fontWeight: 700, color: ss ? ss.text : color, marginLeft: "auto", flexShrink: 0 }}>Score: {s.matchScore}</span>
          )}
          {s.confidence != null && (
            <span style={{ fontSize: 10, fontWeight: 700, color: ss ? ss.text : color, flexShrink: 0 }}>{Math.round(s.confidence * 100)}%</span>
          )}
        </div>
        {isRejected && (showRejectedNote !== false) && (
          <div style={{ fontSize: 11, color: "#a02020", background: "#fde8e8", border: "1px solid #e0a0a0", borderRadius: 6, padding: "5px 9px", marginBottom: 8, lineHeight: 1.4 }}>
            Not usable as evidence. Shown for research trace only.
          </div>
        )}
        {s.url
          ? <a href={s.url} target="_blank" rel="noopener noreferrer"
               style={{ fontWeight: 600, fontSize: 13, color: isRejected ? "#a02020" : "var(--accent)", textDecoration: "none", lineHeight: 1.4, display: "block", marginBottom: 4 }}
               onMouseOver={(e) => { e.currentTarget.style.textDecoration = "underline"; }}
               onMouseOut={(e) => { e.currentTarget.style.textDecoration = "none"; }}>
              {s.title || s.url}
            </a>
          : <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", marginBottom: 4 }}>{s.title || "Source"}</div>
        }
        {s.url && (
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url}</div>
        )}
        {s.snippet && <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55, marginBottom: 5 }}>{s.snippet}</div>}
        {s.reason && <div style={{ fontSize: 11, color: ss ? ss.text : "var(--muted)", fontStyle: "italic" }}>{"\u21b3"} {s.reason}</div>}
        {!s.reason && s.relevance && <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>{"\u21b3"} {s.relevance}</div>}
        {s.query && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 5 }}>Query: {s.query}</div>}
      </div>
    </div>
  );
}

function StrengthSection({ title, sources, defaultOpen = true, accentColor, showRejectedNote }) {
  const [open, setOpen] = React.useState(defaultOpen);
  if (!sources || sources.length === 0) return null;
  return (
    <div style={{ border: "1px solid var(--line-2)", borderRadius: 10, overflow: "hidden" }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "var(--bg)", border: "none", cursor: "pointer", textAlign: "left" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: accentColor || "var(--ink-2)", flex: 1 }}>{title}</span>
        <span style={{ fontSize: 10, background: accentColor ? accentColor + "22" : "var(--line-2)", color: accentColor || "var(--muted)", borderRadius: 8, padding: "1px 7px", fontWeight: 700 }}>{sources.length}</span>
        <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 4 }}>{open ? "\u25B2" : "\u25BC"}</span>
      </button>
      {open && (
        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--line-2)" }}>
          {sources.map((s, i) => <SourceCard key={i} s={s} i={i} showRejectedNote={showRejectedNote} />)}
        </div>
      )}
    </div>
  );
}

function ResearchPlatformTab({ platformSources, allSources, result, emptyMessage, tabQueries }) {
  // Split platform sources by strength
  const high     = platformSources.filter(s => s.matchStrength === "confirmed" || s.matchStrength === "likely");
  const possible = platformSources.filter(s => s.matchStrength === "possible");
  const weak     = platformSources.filter(s => s.matchStrength === "weak");
  const rejected = platformSources.filter(s => s.matchStrength === "rejected");
  // Fallback: if nothing has matchStrength, show all as possible
  const hasStrength = platformSources.some(s => s.matchStrength);
  const legacyAll = !hasStrength ? platformSources : [];

  const queryChips = tabQueries && tabQueries.length > 0 ? (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", marginBottom: 16 }}>
      <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Searched:</span>
      {tabQueries.map((q, i) => (
        <span key={i} style={{ fontSize: 10, background: "var(--line-2)", color: "var(--ink-2)", borderRadius: 4, padding: "2px 7px" }}>{q}</span>
      ))}
    </div>
  ) : null;

  if (platformSources.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {queryChips}
        <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>{"\uD83D\uDD0D"}</div>
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {queryChips}
      {legacyAll.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {legacyAll.map((s, i) => <SourceCard key={i} s={s} i={i} />)}
        </div>
      )}
      <StrengthSection title="High Confidence" sources={high} defaultOpen={true} accentColor="#2DC88A" />
      <StrengthSection title="Possible Leads" sources={possible} defaultOpen={true} accentColor="#F5A623" />
      <StrengthSection title="Weak Leads" sources={weak} defaultOpen={true} accentColor="#aaa" />
      <StrengthSection title="Rejected / Noise" sources={rejected} defaultOpen={false} accentColor="#E05252" showRejectedNote={true} />
    </div>
  );
}

function RoxanneResearchSheet({ talent, instructions, initialRun, onClose }) {
  instructions = instructions || "";
  const [tab, setTab] = React.useState("linkedin");
  const [closing, setClosing] = React.useState(false);
  const [run, setRun] = React.useState(initialRun || null);
  const [loading, setLoading] = React.useState(!initialRun);
  const [error, setError] = React.useState(null);
  const tones = ["tone-a", "tone-b", "tone-c", "tone-d"];
  const tone = tones[(talent.name || "").charCodeAt(0) % tones.length];
  const pollRef = React.useRef(null);

  function handleClose() { clearInterval(pollRef.current); setClosing(true); setTimeout(onClose, 280); }

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); clearInterval(pollRef.current); };
  }, []);

  function applyRun(r) {
    setRun(r);
    if (!r) { setError("No result returned."); setLoading(false); return; }
    if (r.status === "failed") {
      const msg = r.error || "Research failed.";
      setError(msg.includes("401") || msg.includes("Incorrect API key")
        ? "OpenAI API key is invalid or has expired. Update OPENAI_API_KEY in your .env file and restart the server."
        : msg);
      setLoading(false);
    } else if (r.status === "completed") {
      setLoading(false);
    }
    // queued/running — keep spinner, polling handles update
  }

  function startPolling(runId) {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetch(`/api/admin/careers/talent-pool/${talent.id}/research/${runId}`)
        .then((r) => r.json())
        .then((data) => {
          if (!data.ok || !data.run) return;
          applyRun(data.run);
          if (data.run.status !== "queued" && data.run.status !== "running") {
            clearInterval(pollRef.current);
          }
        })
        .catch(() => {});
    }, 3000);
  }

  function launchRun() {
    setLoading(true); setError(null); setRun(null);
    window.HEYA_API.runTalentResearch(talent.id, { instructions })
      .then((data) => {
        applyRun(data.run);
        if (data.run && (data.run.status === "queued" || data.run.status === "running")) {
          startPolling(data.run.id);
        }
      })
      .catch((err) => { setError(err.message || "Research failed."); setLoading(false); });
  }

  React.useEffect(() => {
    if (initialRun) {
      applyRun(initialRun);
      if (initialRun.status === "queued" || initialRun.status === "running") {
        startPolling(initialRun.id);
      }
      return;
    }
    launchRun();
  }, [talent.id]);

  const handleRunAgain = () => launchRun();

  const result        = run ? run.result : null;
  const notConfigured = result && result.sourceStatus === "not_configured";

  // Use rawCollectedSources for full picture; fall back to sources for older runs
  const allCollected  = result ? (result.rawCollectedSources || result.sources || []) : [];
  const sources       = result ? (result.sources || []) : [];

  // Per-bucket: use allCollected so counts include weak/rejected
  const liSources     = allCollected.filter((s) => s.bucket === "linkedin" || s.type === "linkedin");
  const fbSources     = allCollected.filter((s) => s.bucket === "facebook" || s.type === "facebook");
  const otherSources  = allCollected.filter((s) => {
    const b = s.bucket || (s.type === "linkedin" ? "linkedin" : s.type === "facebook" ? "facebook" : "other");
    return b === "other";
  });

  const tabs = [
    { id: "linkedin",    label: "LinkedIn",     color: "#0077B5", count: liSources.length },
    { id: "facebook",    label: "Facebook",     color: "#1877F2", count: fbSources.length },
    { id: "other",       label: "Other",        color: "#7B61FF", count: otherSources.length },
    { id: "allcollected",label: "All Collected", color: "#555",   count: allCollected.length },
  ];

  return (
    <div className={"roxanne-sheet-scrim" + (closing ? " is-closing" : "")} onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className={"roxanne-sheet" + (closing ? " is-closing" : "")}>

        <div className="roxanne-sheet__head">
          <div className="roxanne-sheet__head-left">
            <div className={"avatar " + tone} style={{ width: 56, height: 56, overflow: "hidden", flexShrink: 0 }}>
              {talent.idPhotoFile && talent.idPhotoFile.viewUrl
                ? <img src={talent.idPhotoFile.viewUrl} alt={talent.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
                : <I.User className="avatar-placeholder" style={{ width: "56%", height: "56%", opacity: 0.9 }} />}
            </div>
            <div>
              <div className="roxanne-sheet__name">{talent.name || "Unknown"}</div>
              <div className="roxanne-sheet__title">{talent.title || "No title on record"}</div>
              <div className="roxanne-sheet__meta">
                {talent.location && <span>{"\uD83D\uDCCD"} {talent.location}</span>}
                {run && run.completedAt && <span style={{ color: "var(--muted)", fontSize: 11 }}>Run {new Date(run.completedAt).toLocaleString()}</span>}
              </div>
            </div>
          </div>
          <div className="roxanne-sheet__head-right">
            <div className="roxanne-ai-badge"><I.Globe style={{ width: 12, height: 12 }} /> Public Research</div>
            {!loading && !notConfigured && (
              <button className="btn ghost sm" style={{ fontSize: 12 }} onClick={handleRunAgain}>{"\u21BB"} Re-run</button>
            )}
            <button className="icon-btn" onClick={handleClose} title="Close"><I.X /></button>
          </div>
        </div>

        {loading && (
          <CubeLoader
            label="Searching LinkedIn, Facebook & web\u2026"
            sublabel="Running targeted searches across three passes. This may take 30\u201360 seconds."
          />
        )}

        {!loading && error && (
          <div style={{ padding: "32px", margin: "16px 24px", background: "#fdf0f0", border: "1px solid #e05252", borderRadius: 12, color: "#c0392b", fontSize: 13 }}>
            <strong>Research failed:</strong> {error}
            <div style={{ marginTop: 12 }}><button className="btn ghost sm" onClick={handleRunAgain}>Try again</button></div>
          </div>
        )}

        {!loading && notConfigured && (
          <div style={{ padding: "32px 24px" }}>
            <div style={{ padding: "24px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--bg)", textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{"\uD83D\uDD0C"}</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Public research is not configured</div>
              <div style={{ fontSize: 13, color: "var(--muted)", maxWidth: 420, margin: "0 auto", lineHeight: 1.6 }}>
                Set <code style={{ background: "var(--line-2)", padding: "1px 5px", borderRadius: 4 }}>TALENT_RESEARCH_ENABLED=true</code> and <code style={{ background: "var(--line-2)", padding: "1px 5px", borderRadius: 4 }}>OPENAI_API_KEY</code> in your environment to activate.
              </div>
            </div>
          </div>
        )}

        {!loading && result && !notConfigured && (
          <React.Fragment>


            <div className="roxanne-sheet__tabs">
              {tabs.map((t) => (
                <button key={t.id} className={"roxanne-tab" + (tab === t.id ? " is-active" : "")}
                        onClick={() => setTab(t.id)}
                        style={tab === t.id ? { borderBottomColor: t.color, color: t.color } : {}}>
                  {t.label}
                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700,
                                 background: t.count > 0 ? t.color : "var(--line-2)",
                                 color: t.count > 0 ? "#fff" : "var(--muted)",
                                 borderRadius: 8, padding: "1px 5px" }}>{t.count}</span>
                </button>
              ))}
            </div>

            <div className="roxanne-sheet__body">
              {tab === "linkedin" && (
                <ResearchPlatformTab platformSources={liSources} allSources={allCollected} result={result}
                  tabQueries={(result.researchPlan && result.researchPlan.linkedin) || result.searchQueries || []}
                  emptyMessage="No LinkedIn profiles were found for this candidate." />
              )}
              {tab === "facebook" && (
                <ResearchPlatformTab platformSources={fbSources} allSources={allCollected} result={result}
                  tabQueries={(result.researchPlan && result.researchPlan.facebook) || result.searchQueries || []}
                  emptyMessage="No Facebook profiles or pages were found for this candidate." />
              )}
              {tab === "other" && (
                <ResearchPlatformTab platformSources={otherSources} allSources={allCollected} result={result}
                  tabQueries={(result.researchPlan && result.researchPlan.other) || result.searchQueries || []}
                  emptyMessage="No other web sources were found for this candidate." />
              )}
              {tab === "allcollected" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, padding: "10px 0 4px" }}>
                    All {allCollected.length} source{allCollected.length !== 1 ? "s" : ""} collected during research, sorted by confidence score. Includes confirmed, possible, weak, and rejected results.
                  </div>
                  <StrengthSection title="High Confidence" sources={allCollected.filter(s => s.matchStrength === "confirmed" || s.matchStrength === "likely")} defaultOpen={true} accentColor="#2DC88A" />
                  <StrengthSection title="Possible Leads" sources={allCollected.filter(s => s.matchStrength === "possible")} defaultOpen={true} accentColor="#F5A623" />
                  <StrengthSection title="Weak Leads" sources={allCollected.filter(s => s.matchStrength === "weak")} defaultOpen={true} accentColor="#aaa" />
                  <StrengthSection title="Rejected / Noise" sources={allCollected.filter(s => s.matchStrength === "rejected")} defaultOpen={false} accentColor="#E05252" showRejectedNote={true} />
                  {allCollected.every(s => !s.matchStrength) && allCollected.map((s, i) => <SourceCard key={i} s={s} i={i} />)}
                </div>
              )}

              {result.followUpQuestions && result.followUpQuestions.length > 0 && (
                <div style={{ borderTop: "1px solid var(--line)", marginTop: 24, paddingTop: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)", marginBottom: 10 }}>{"\uD83D\uDCAC"} Suggested Follow-Up Questions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {result.followUpQuestions.map((q, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--paper)", fontSize: 13, alignItems: "flex-start" }}>
                        <span style={{ color: "var(--accent)", fontWeight: 700, flexShrink: 0 }}>Q{i + 1}</span>
                        <span style={{ lineHeight: 1.55 }}>{q}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ borderTop: "1px solid var(--line)", marginTop: 20, paddingTop: 14, display: "flex", flexDirection: "column", gap: 5 }}>
                {(result.caveats || []).map((c, i) => (
                  <div key={i} style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.55 }}>{"\u26A0"} {c}</div>
                ))}
              </div>
            </div>
          </React.Fragment>
        )}

      </div>
    </div>
  );
}



/* ── Unified top-nav tab bar ─────────────────────────────────────────────── */

function PoolTopNav({ pools, selectedView, onSelect, favorites, talents, onCreatePool, onRefresh, pushToast }) {
  const [activeMenu, setActiveMenu] = React.useState(null); // pool.id of open tab menu
  const [editingPool, setEditingPool] = React.useState(null);
  const [addMembersPool, setAddMembersPool] = React.useState(null);

  const allCount = talents.length;
  function handleDelete(pool) {
    if (!window.confirm(`Delete pool "${pool.name}"?\n\nTalent applicants will NOT be deleted — only the pool group is removed.`)) return;
    window.HEYA_API.deleteTalentPool(pool.id)
      .then(d => {
        if (d.ok) {
          onRefresh();
          if (selectedView === `pool:${pool.id}`) onSelect("all");
          pushToast(`Pool "${pool.name}" deleted`, false);
        }
      })
      .catch(() => pushToast("Failed to delete pool", false));
  }

  React.useEffect(() => {
    function handleClick() { setActiveMenu(null); }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <div className="pool-tab-strip">
      {/* All Talent */}
      <button
        className={"pool-tab" + (selectedView === "all" ? " is-active" : "")}
        onClick={() => onSelect("all")}
      >
        All Talent {allCount > 0 && <span className="pool-tab-count">{allCount}</span>}
      </button>

      {/* Named pool tabs */}
      {pools.map(pool => {
        const viewKey = `pool:${pool.id}`;
        const isActive = selectedView === viewKey;
        const menuOpen = activeMenu === pool.id;
        const count = pool.memberCount || 0;
        return (
          <div key={pool.id} className={"pool-tab-wrap" + (isActive ? " is-active" : "")}>
            <button
              className={"pool-tab pool-tab--named" + (isActive ? " is-active" : "")}
              onClick={() => onSelect(viewKey)}
            >
              {pool.name} {count > 0 && <span className="pool-tab-count">{count}</span>}
            </button>
            <button
              className="pool-tab-menu-btn"
              title="Pool actions"
              onClick={(e) => { e.stopPropagation(); setActiveMenu(menuOpen ? null : pool.id); }}
              aria-label={`Actions for ${pool.name}`}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <circle cx="8" cy="2" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="14" r="1.5"/>
              </svg>
            </button>
            {menuOpen && (
              <div className="pool-tab-popover" onClick={e => e.stopPropagation()}>
                <button className="pool-tab-popover-item" onClick={() => { setActiveMenu(null); setAddMembersPool(pool); }}>Add talent</button>
                <button className="pool-tab-popover-item" onClick={() => { setActiveMenu(null); setEditingPool(pool); }}>Edit pool</button>
                <button className="pool-tab-popover-item danger" onClick={() => { setActiveMenu(null); handleDelete(pool); }}>Delete pool</button>
              </div>
            )}
          </div>
        );
      })}

      {/* Create Pool */}
      <button className="pool-tab pool-tab--create" onClick={onCreatePool}>
        <I.Plus style={{ width: 11, height: 11, marginRight: 3 }} /> Create Pool
      </button>

      {/* Separator */}
      <div className="pool-tab-sep" aria-hidden="true" />

      {/* Favorites */}
      <button
        className={"pool-tab" + (selectedView === "favorites" ? " is-active" : "")}
        onClick={() => onSelect("favorites")}
      >
        <I.Star style={{ width: 12, height: 12, marginRight: 4 }} />
        Favorites {favorites.size > 0 && <span className="pool-tab-count">{favorites.size}</span>}
      </button>

      {editingPool && (
        <EditPoolModal
          pool={editingPool}
          onClose={() => setEditingPool(null)}
          onSave={() => { onRefresh(); setEditingPool(null); pushToast("Pool updated", false); }}
        />
      )}
      {addMembersPool && (
        <AddTalentsToPoolModal
          pool={addMembersPool}
          talents={talents}
          existingMemberIds={(addMembersPool.memberIds || [])}
          onClose={() => setAddMembersPool(null)}
          onSaved={() => {
            setAddMembersPool(null);
            onRefresh();
            onSelect(`pool:${addMembersPool.id}`);
            pushToast("Members added", false);
          }}
        />
      )}
    </div>
  );
}

/* ── Pool Modals ─────────────────────────────────────────────────────────── */

function EditPoolModal({ pool, onClose, onSave }) {
  const [name, setName] = React.useState(pool.name || "");
  const [category, setCategory] = React.useState(pool.category || "");
  const [description, setDescription] = React.useState(pool.description || "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  // Close on Escape
  React.useEffect(() => {
    function onKey(e) { if (e.key === "Escape" && !saving) onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [saving, onClose]);

  function handleSave() {
    if (!name.trim()) { setError("Pool name is required."); return; }
    setError("");
    setSaving(true);
    window.HEYA_API.updateTalentPool(pool.id, {
      name: name.trim(),
      category: category.trim() || null,
      description: description.trim() || null,
    })
      .then(d => {
        setSaving(false);
        if (d.ok) onSave(d.pool);
        else setError(d.error || "Failed to save — please try again.");
      })
      .catch(() => { setSaving(false); setError("Network error — please try again."); });
  }

  return (
    <div className="pool-modal-backdrop" onClick={() => { if (!saving) onClose(); }}>
      <div className="pool-edit-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pem-title">
        <div className="pool-edit-modal__header">
          <div>
            <h3 className="pool-edit-modal__title" id="pem-title">Edit pool</h3>
            <p className="pool-edit-modal__subtitle">Update this talent pool label and notes.</p>
          </div>
          <button className="pool-edit-modal__close" onClick={onClose} aria-label="Close" disabled={saving}>
            <I.X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <div className="pool-edit-modal__body">
          {error && <div className="pool-edit-modal__error">{error}</div>}

          <div className="pool-edit-modal__field">
            <label className="pool-edit-modal__label" htmlFor="pem-name">Pool name <span aria-hidden="true">*</span></label>
            <input
              id="pem-name"
              className={"pool-edit-modal__input" + (!name.trim() && error ? " is-invalid" : "")}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. A Pool, Top Talent, Watchlist"
              autoFocus
              disabled={saving}
            />
          </div>

          <div className="pool-edit-modal__field">
            <label className="pool-edit-modal__label" htmlFor="pem-category">Pool level / label</label>
            <input
              id="pem-category"
              className="pool-edit-modal__input"
              value={category}
              onChange={e => setCategory(e.target.value)}
              placeholder="e.g. A Pool · B Pool · Top Talent · Watchlist"
              disabled={saving}
            />
          </div>

          <div className="pool-edit-modal__field">
            <label className="pool-edit-modal__label" htmlFor="pem-desc">Notes</label>
            <textarea
              id="pem-desc"
              className="pool-edit-modal__input pool-edit-modal__textarea"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional notes about this pool…"
              disabled={saving}
            />
          </div>
        </div>

        <div className="pool-edit-modal__footer">
          <button className="pool-edit-modal__btn-cancel" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="pool-edit-modal__btn-save"
            onClick={handleSave}
            disabled={saving || !name.trim()}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddTalentsToPoolModal({ pool, talents, existingMemberIds, onClose, onSaved }) {
  const existingSet = React.useMemo(() => new Set(existingMemberIds.map(String)), [existingMemberIds]);
  const [search, setSearch] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return talents.filter(t => {
      if (!q) return true;
      return (t.name || "").toLowerCase().includes(q)
        || (t.email || "").toLowerCase().includes(q)
        || (t.roleTitle || t.title || "").toLowerCase().includes(q);
    });
  }, [talents, search]);

  function toggle(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function handleSave() {
    if (selectedIds.length === 0) { setError("Select at least one talent"); return; }
    setSaving(true);
    window.HEYA_API.addTalentPoolMembers(pool.id, selectedIds)
      .then(d => { setSaving(false); if (d.ok) onSaved(); else setError(d.error || "Failed"); })
      .catch(() => { setSaving(false); setError("Network error"); });
  }

  return (
    <div className="cps-backdrop" onClick={onClose}>
      <div className="cps-modal pm-add-modal" onClick={e => e.stopPropagation()}>
        <div className="cps-modal__header">
          <h3 className="cps-modal__title">Add to "{pool.name}"</h3>
          <button className="cps-modal__close" onClick={onClose}><I.X /></button>
        </div>
        <div className="cps-modal__body">
          {error && <div className="form-error">{error}</div>}
          <input
            className="form-input"
            placeholder="Search by name, email, or role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginBottom: 12 }}
          />
          <div className="pm-talent-pick-list">
            {filtered.map(t => {
              const isExisting = existingSet.has(String(t.id));
              const isSelected = selectedIds.includes(t.id);
              return (
                <label key={t.id} className={"pm-talent-pick-row" + (isExisting ? " is-existing" : "") + (isSelected ? " is-selected" : "")}>
                  <input
                    type="checkbox"
                    checked={isSelected || isExisting}
                    disabled={isExisting}
                    onChange={() => !isExisting && toggle(t.id)}
                  />
                  <span className="pm-talent-pick-name">{t.name || [t.firstName, t.lastName].filter(Boolean).join(" ") || "Unknown"}</span>
                  <span className="pm-talent-pick-role">{t.roleTitle || t.title || ""}</span>
                  {isExisting && <span className="pm-talent-pick-badge">In pool</span>}
                </label>
              );
            })}
            {filtered.length === 0 && <div className="pm-empty">No matching talent.</div>}
          </div>
          <div className="pm-pick-footer">{selectedIds.length > 0 && `${selectedIds.length} selected`}</div>
        </div>
        <div className="cps-modal__footer">
          <button className="btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn" onClick={handleSave} disabled={saving || selectedIds.length === 0}>{saving ? "Adding…" : `Add ${selectedIds.length > 0 ? selectedIds.length : ""} to pool`}</button>
        </div>
      </div>
    </div>
  );
}

function CreatePoolModal({ talents, pools, setPools, onClose, onSave, onRefreshTalents }) {
  const [poolName, setPoolName] = React.useState('');
  const [poolDesc, setPoolDesc] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');

  const filteredTalents = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return talents;
    return talents.filter(t => {
      const hay = [t.name, t.email, t.title, t.desiredRoles, t.location,
        ...(t.skills || []), ...(t.tags || []),
        ...(t.pools || []).map(p => p.name)
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [talents, search]);

  const selectedTalents = talents.filter(t => selectedIds.includes(t.id));

  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!poolName.trim()) { setError('Pool name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await window.HEYA_API.createTalentPool({ name: poolName.trim(), description: poolDesc.trim() });
      if (!res.ok) throw new Error(res.error || 'Failed to create pool');
      if (selectedIds.length > 0) {
        await window.HEYA_API.addTalentPoolMembers(res.pool.id, selectedIds);
        if (typeof onRefreshTalents === "function") onRefreshTalents();
      }
      const poolsRes = await window.HEYA_API.listTalentPools();
      if (poolsRes.ok) setPools(poolsRes.pools || []);
      if (onSave) onSave(res.pool);
      onClose();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  React.useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="publish-scrim" onClick={onClose}>
      <div className="create-pool-modal" onClick={e => e.stopPropagation()}>
        <div className="create-pool-modal__header">
          <h2 className="create-pool-modal__title">Create talent pool</h2>
          <button className="roxanne-close" onClick={onClose} aria-label="Close"><I.X /></button>
        </div>
        <div className="create-pool-modal__body">
          {/* LEFT COLUMN */}
          <div className="create-pool-modal__left">
            <div className="create-pool-modal__fields">
              <input
                className="talent-search__input"
                type="text"
                placeholder="Pool name (e.g. A, Top Talent, Mining Priority)"
                value={poolName}
                onChange={e => setPoolName(e.target.value)}
                autoFocus
              />
              <input
                className="talent-search__input"
                type="text"
                placeholder="Description (optional)"
                value={poolDesc}
                onChange={e => setPoolDesc(e.target.value)}
              />
            </div>
            <div className="create-pool-modal__search-wrap">
              <I.Search style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
              <input
                className="talent-search__input"
                style={{ paddingLeft: 34 }}
                type="text"
                placeholder="Search applicants..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="create-pool-modal__list">
              {filteredTalents.length === 0 && (
                <div className="create-pool-modal__empty">No applicants found.</div>
              )}
              {filteredTalents.map(t => {
                const isSelected = selectedIds.includes(t.id);
                const existingPools = t.pools || [];
                return (
                  <div
                    key={t.id}
                    className={"create-pool-modal__item" + (isSelected ? ' is-selected' : '')}
                    onClick={() => toggleSelect(t.id)}
                  >
                    <div className="create-pool-modal__item-name">{t.name}</div>
                    <div className="create-pool-modal__item-meta">{t.title || t.desiredRoles || ''}{t.location ? ` · ${t.location}` : ''}</div>
                    {existingPools.length > 0 && (
                      <div className="create-pool-modal__item-pools">
                        {existingPools.map(p => <span key={p.id} className="pool-category-chip" style={{ fontSize: 9 }}>{p.name}</span>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {/* RIGHT COLUMN */}
          <div className="create-pool-modal__right">
            <div className="create-pool-modal__right-header">
              Selected <span className="create-pool-modal__count">{selectedIds.length}</span>
            </div>
            <div className="create-pool-modal__chips">
              {selectedTalents.length === 0 && (
                <div className="create-pool-modal__chips-empty">Click applicants to add them.</div>
              )}
              {selectedTalents.map(t => (
                <div key={t.id} className="create-pool-modal__chip">
                  <span>{t.name}</span>
                  <button onClick={() => toggleSelect(t.id)} aria-label={`Remove ${t.name}`}><I.X /></button>
                </div>
              ))}
            </div>
            {error && <div className="create-pool-modal__error">{error}</div>}
            <div className="create-pool-modal__actions">
              <button className="btn ghost" onClick={onClose} disabled={saving}>Cancel</button>
              <button className="btn primary" onClick={handleSave} disabled={saving || !poolName.trim()}>
                {saving ? 'Creating…' : 'Create pool'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.TalentPoolView = TalentPoolView;
