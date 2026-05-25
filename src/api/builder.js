export function createBuilderActions({
  apiRequest,
  buildGithubSandbox,
  createId,
  fetchGithubSnapshot,
  makeActivity,
  makeBuilderSite,
  makeProject,
  notifyDataChanged,
  parseGithubRepo,
  readLocalDb,
  slugify,
  triggerRenderDeploy,
  writeLocalDb,
}) {
  async function createBuilderSite(input) {
    const site = await apiRequest('/builder/sites', { method: 'POST', body: JSON.stringify(input) });
    notifyDataChanged();
    return site;
  }

  return {
    async listBuilderSites() {
      return readLocalDb().sites;
    },

    async getBuilderSite(siteId) {
      return readLocalDb().sites.find((site) => site.id === siteId) || null;
    },

    async createBuilderSite(input) {
      return createBuilderSite(input);
    },

    async updateBuilderSite(siteId, input) {
      const site = await apiRequest(`/builder/sites/${siteId}`, { method: 'PATCH', body: JSON.stringify(input) });
      notifyDataChanged();
      return site;
    },

    async archiveBuilderSite(siteId) {
      const result = await apiRequest(`/builder/sites/${siteId}`, { method: 'DELETE' });
      notifyDataChanged();
      return result;
    },

    async saveBuilderPage(siteId, pageId, content) {
      const page = await apiRequest(`/builder/sites/${siteId}/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ content }) });
      notifyDataChanged();
      return page;
    },

    async createBuilderPage(siteId, input) {
      const page = await apiRequest(`/builder/sites/${siteId}/pages`, { method: 'POST', body: JSON.stringify(input) });
      notifyDataChanged();
      return page;
    },

    async listBuilderPages(siteId) {
      return apiRequest(`/builder/sites/${siteId}/pages`);
    },

    async deleteBuilderPage(siteId, pageId) {
      const result = await apiRequest(`/builder/sites/${siteId}/pages/${pageId}`, { method: 'DELETE' });
      notifyDataChanged();
      return result;
    },

    async listPageVersions(siteId, pageId) {
      return [];
    },

    async publishBuilderSite(siteId) {
      const site = await apiRequest(`/builder/sites/${siteId}/publish`, { method: 'POST' });
      const renderDeploy = await triggerRenderDeploy({ siteId, renderServiceId: site.renderServiceId });
      notifyDataChanged();
      return { ...site, renderDeploy };
    },

    async uploadBuilderSitePackage(file) {
      const db = readLocalDb();
      const site = makeBuilderSite({
        name: (file?.name || 'Uploaded Site').replace(/\.zip$/i, ''),
        source: 'upload',
        filename: file?.name || 'upload.zip',
      });
      db.sites.unshift(site);
      writeLocalDb(db);
      notifyDataChanged();
      return site;
    },

    async importBuilderSiteFromGithub(input) {
      const repo = parseGithubRepo(input.repoUrl);
      if (!repo) {
        throw new Error('Enter a valid GitHub repository URL, for example https://github.com/owner/repo.');
      }

      const siteName = input.name || repo.repo;
      const branch = input.branch || 'main';
      const sandboxId = createId('sandbox');
      const snapshot = await fetchGithubSnapshot(repo, branch);
      const sandbox = await buildGithubSandbox(input, repo, branch, sandboxId);
      const site = await createBuilderSite({
        name: siteName,
        templateId: null,
        source: 'github',
        repositoryProvider: 'github',
        repositoryOwner: repo.owner,
        repositoryName: repo.repo,
        repositoryUrl: repo.url,
        branch,
        rootDirectory: input.rootDirectory || '',
        framework: input.framework || 'Vite + React',
        installCommand: input.installCommand || 'npm ci',
        buildCommand: input.buildCommand || 'npm run build',
        outputDirectory: input.outputDirectory || 'dist',
        content: {
          _source: 'github',
          _repository: repo.fullName,
          _branch: branch,
          _importedAt: new Date().toISOString(),
          _githubImportStatus: snapshot.status,
          _githubSummary: snapshot.summary,
          _githubFiles: snapshot.files,
          _githubFileContents: snapshot.contents,
          _githubEntryHtml: snapshot.entryHtml,
          _sandboxId: sandboxId,
          _sandboxStatus: sandbox.status,
          _sandboxPreviewUrl: sandbox.previewUrl,
          _sandboxOutputDirectory: sandbox.outputDirectory,
          _sandboxMode: sandbox.mode || 'static',
          _sandboxFiles: sandbox.files || [],
          _sandboxLogs: sandbox.logs,
          _sandboxError: sandbox.error,
        },
      });

      const db = readLocalDb();
      const project = makeProject({
        name: siteName,
        slug: slugify(siteName),
        framework: input.framework || 'Vite + React',
        repositoryProvider: 'github',
        repositoryOwner: repo.owner,
        repositoryName: repo.repo,
        repositoryUrl: repo.url,
        productionBranch: branch,
      });
      db.projects.unshift(project);
      const storedSite = db.sites.find((item) => item.id === site.id);
      if (storedSite) {
        storedSite.projectId = project.id;
        storedSite.repositoryProvider = 'github';
        storedSite.repositoryOwner = repo.owner;
        storedSite.repositoryName = repo.repo;
        storedSite.repositoryUrl = repo.url;
        storedSite.branch = branch;
        storedSite.rootDirectory = input.rootDirectory || '';
        storedSite.framework = input.framework || 'Vite + React';
        storedSite.installCommand = input.installCommand || 'npm ci';
        storedSite.buildCommand = input.buildCommand || 'npm run build';
        storedSite.outputDirectory = input.outputDirectory || 'dist';
        storedSite.sandboxId = sandboxId;
        storedSite.previewUrl = sandbox.previewUrl || null;
      }
      db.activity.unshift(makeActivity('builder.github_imported', `Imported ${repo.fullName} from GitHub.`, 'builder_site', site.id));
      writeLocalDb(db);
      notifyDataChanged();

      return storedSite || { ...site, projectId: project.id };
    },
  };
}
