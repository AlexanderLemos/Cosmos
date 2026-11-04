//! COSMOS Memory rules.
//!
//! "One rule, one place" (plan §6): every memory rule (project resolution, consolidation,
//! evidence, conflicts) lives in this crate. MCP, HTTP, IPC and the Desktop UI are only
//! entry points that translate into [`MemoryService`] calls.
//!
//! Phase 0 defines the boundaries; the implementation arrives in F1 (ADR 0001).

pub mod budget;

pub use budget::ContextBudget;

use cosmos_core::{Event, ProjectId, SessionSummary};

#[derive(Debug, thiserror::Error)]
pub enum MemoryError {
    #[error("project is ambiguous; ask the user which one to use")]
    AmbiguousProject { candidates: Vec<ProjectId> },
    #[error("caller has no `{scope}` scope on project {project}")]
    Forbidden {
        project: ProjectId,
        scope: &'static str,
    },
    #[error("document changed since revision {expected}")]
    Conflict { expected: String },
    #[error("not implemented yet (Phase 0)")]
    NotImplemented,
}

/// The single implementation of memory rules (plan §17.4). Transports call only this.
pub trait MemoryService {
    /// Record a normalized event. Duplicates (same idempotency key) are ignored.
    fn ingest_event(&self, event: Event) -> Result<Ingested, MemoryError>;

    /// Build the Thread of Ariadne for a project within a token budget.
    fn get_context(&self, project: ProjectId, budget: ContextBudget)
        -> Result<String, MemoryError>;

    /// Validate an agent summary against recorded evidence and consolidate the session.
    fn close_session(&self, summary: SessionSummary) -> Result<(), MemoryError>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Ingested {
    Accepted,
    Duplicate,
}
