import { Request } from 'express';

export interface RequestWithContext extends Request {
  requestId?: string;
  auth?: {
    user: {
      id: string;
      email: string;
      name: string | null;
      avatarUrl: string | null;
      status: string;
    };
    organization: {
      id: string;
      name: string;
      slug: string;
    };
    membership: {
      id: string;
      roleId: string;
      roleKey: string;
    };
    session: {
      id: string;
    };
    permissions: string[];
  };
}
