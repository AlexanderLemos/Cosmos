//! Token budget of the Thread of Ariadne (plan §16.2).

/// Budget for the compact context injected at session start.
///
/// Default 1200 tokens; configurable per project within 800..=1500. Values outside the range
/// are clamped rather than rejected, so a bad config never blocks a session start.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ContextBudget(u32);

impl ContextBudget {
    pub const MIN: u32 = 800;
    pub const MAX: u32 = 1500;
    pub const DEFAULT: u32 = 1200;

    pub fn new(tokens: u32) -> Self {
        Self(tokens.clamp(Self::MIN, Self::MAX))
    }

    pub fn tokens(self) -> u32 {
        self.0
    }
}

impl Default for ContextBudget {
    fn default() -> Self {
        Self(Self::DEFAULT)
    }
}

/// Rough, model-agnostic token estimate (≈ 4 characters per token). Good enough for
/// budgeting; the benchmark in §26.9 measures real tokenizer counts.
pub fn estimate_tokens(text: &str) -> u32 {
    let chars = text.chars().count() as u32;
    chars.div_ceil(4)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamps_to_range() {
        assert_eq!(ContextBudget::new(10).tokens(), 800);
        assert_eq!(ContextBudget::new(9000).tokens(), 1500);
        assert_eq!(ContextBudget::default().tokens(), 1200);
    }

    #[test]
    fn estimates_tokens() {
        assert_eq!(estimate_tokens(""), 0);
        assert_eq!(estimate_tokens("abcd"), 1);
        assert_eq!(estimate_tokens("abcde"), 2);
    }
}
