import type { ApiTokenScope, UserRole } from "@gestor/shared";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        name: string;
        email: string;
        role: UserRole;
        isActive: boolean;
      };
      /** Cómo se autenticó la petición REST. */
      principal?:
        | { kind: "session"; scopes: ApiTokenScope[] }
        | { kind: "pat"; tokenId: number; scopes: ApiTokenScope[] };
    }
  }
}

export {};
