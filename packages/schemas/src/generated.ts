/* Generated from Rust via schemars. Do not edit. */
export namespace BindingContract {
export type Binding =
  | {
      kind: "path";
      value: string;
    }
  | {
      kind: "git_root_commit";
      value: string;
    }
  | {
      kind: "git_remote";
      value: string;
    }
  | {
      kind: "marker";
      value: string;
    }
  | {
      kind: "workspace";
      value: string;
    };

}
export namespace EventEnvelopeContract {
export type Harness = "claude-code" | "codex" | "hermes-agent" | "generic-mcp" | "user";
/**
 * First contract slice. Further event types from §14.2 are added with fixtures in F1/F2.
 */
export type Event =
  | {
      payload: {
        harness_session_id: string;
      };
      type: "session.started";
    }
  | {
      payload: {
        initial: boolean;
        redacted_text: string;
      };
      type: "prompt.submitted";
    }
  | {
      payload: {
        paths: string[];
      };
      type: "file.changed";
    }
  | {
      payload: {
        command: string;
        exit_code: number;
        summary: string;
      };
      type: "test.run";
    }
  | {
      payload: {
        summary: string;
      };
      type: "checkpoint";
    }
  | {
      payload: {};
      type: "turn.completed";
    }
  | {
      payload: {};
      type: "session.ended";
    }
  | {
      payload: {
        reason: string;
      };
      type: "session.interrupted";
    };
export type EvidenceKind = "file" | "command" | "commit" | "event";
export type Version1 = 1;

export interface EventEnvelope {
  agent: Agent;
  base_rev?: string | null;
  created_at: string;
  event: Event;
  evidence: Evidence[];
  id: string;
  idempotency_key: string;
  project_id: string;
  schema_version: Version1;
  session_id: string;
}
export interface Agent {
  harness: Harness;
  version: string;
}
export interface Evidence {
  kind: EvidenceKind;
  ref: string;
}

}
export namespace PrivacyDefaultsContract {
/**
 * These defaults are configuration only. No grant is conferred by deserializing them.
 */
export interface PrivacyDefaults {
  autostart_enabled?: boolean;
  capture_authorized?: boolean;
  capture_full_transcript?: boolean;
  http_enabled?: boolean;
  local_ai_enabled?: boolean;
  mirror_enabled?: boolean;
  repo_manifest_enabled?: boolean;
}

}
export namespace ProjectContract {
export type Version1 = 1;

export interface Project {
  archived: boolean;
  display_name: string;
  format_version: Version1;
  id: string;
  privacy: PrivacyDefaults;
  universe: string;
}
/**
 * These defaults are configuration only. No grant is conferred by deserializing them.
 */
export interface PrivacyDefaults {
  autostart_enabled?: boolean;
  capture_authorized?: boolean;
  capture_full_transcript?: boolean;
  http_enabled?: boolean;
  local_ai_enabled?: boolean;
  mirror_enabled?: boolean;
  repo_manifest_enabled?: boolean;
}

}
export namespace ProjectManifestContract {
export type Version1 = 1;

export interface ProjectManifest {
  name?: string | null;
  project_id: string;
  schema_version: Version1;
}

}
export namespace RuntimeInfoContract {
export type Version1 = 1;

export interface RuntimeInfo {
  application_version: string;
  capabilities: string[];
  protocol_version: Version1;
}

}
export namespace VaultCommandContract {
export type VaultCommand =
  | {
      op: "list";
    }
  | {
      op: "read";
      path: string;
    }
  | {
      content: string;
      expected_rev: string;
      op: "write";
      path: string;
    }
  | {
      expected_rev: string;
      from: string;
      op: "move";
      to: string;
    }
  | {
      expected_rev: string;
      op: "trash";
      path: string;
    }
  | {
      op: "list_trash";
    }
  | {
      expected_rev: string;
      id: string;
      op: "restore";
      to: string;
    }
  | {
      op: "search";
      query: string;
    }
  | {
      name: string;
      op: "create_project";
      universe: string;
    };

}
export namespace VaultReplyContract {
export type VaultReply =
  | {
      kind: "paths";
      paths: string[];
    }
  | {
      can_organize: boolean;
      content: string;
      kind: "note";
      path: string;
      rev: string;
    }
  | {
      kind: "saved";
      rev: string;
    }
  | {
      kind: "project";
      path: string;
    }
  | {
      kind: "moved";
      path: string;
    }
  | {
      id: string;
      kind: "trashed";
    }
  | {
      entries: TrashEntry[];
      kind: "trash_entries";
    };

export interface TrashEntry {
  id: string;
  path: string;
  rev: string;
}

}