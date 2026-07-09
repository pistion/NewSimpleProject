// GitHub API type definitions

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  description: string | null;
  html_url: string;
  clone_url: string;
  default_branch: string;
  language: string | null;
  updated_at: string;
  pushed_at: string;
  stargazers_count: number;
  owner: { login: string; avatar_url: string };
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
  commit: { sha: string; url: string };
}

export interface GitHubPushEvent {
  ref: string;           // e.g. "refs/heads/main"
  repository: {
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
    private: boolean;
  };
  head_commit: {
    id: string;
    message: string;
    author: { name: string; email: string };
  } | null;
  sender: { login: string };
}
