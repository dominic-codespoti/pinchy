//! Model pricing table for cost estimation.
//!
//! Prices are in USD per 1 million tokens.

use std::collections::HashMap;
use std::sync::LazyLock;

/// Pricing info for a single model.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ModelPricing {
    /// USD per 1M input tokens.
    pub input_per_1m: f64,
    /// USD per 1M output tokens.
    pub output_per_1m: f64,
    /// USD per 1M cached input tokens (if available).
    #[serde(default)]
    pub cached_per_1m: Option<f64>,
}

impl ModelPricing {
    const fn new(input: f64, output: f64) -> Self {
        Self {
            input_per_1m: input,
            output_per_1m: output,
            cached_per_1m: None,
        }
    }

    const fn with_cache(input: f64, output: f64, cached: f64) -> Self {
        Self {
            input_per_1m: input,
            output_per_1m: output,
            cached_per_1m: Some(cached),
        }
    }
}

/// Built-in pricing table for common models (as of March 2026).
static PRICING_TABLE: LazyLock<HashMap<&'static str, ModelPricing>> = LazyLock::new(|| {
    let mut m = HashMap::new();
    // OpenAI GPT-4o family
    m.insert("gpt-4o", ModelPricing::with_cache(2.50, 10.00, 1.25));
    m.insert(
        "gpt-4o-2024-11-20",
        ModelPricing::with_cache(2.50, 10.00, 1.25),
    );
    m.insert("gpt-4o-mini", ModelPricing::with_cache(0.15, 0.60, 0.075));
    m.insert(
        "gpt-4o-mini-2024-07-18",
        ModelPricing::with_cache(0.15, 0.60, 0.075),
    );
    // GPT-4.1 family
    m.insert("gpt-4.1", ModelPricing::with_cache(2.00, 8.00, 0.50));
    m.insert("gpt-4.1-mini", ModelPricing::with_cache(0.40, 1.60, 0.10));
    m.insert("gpt-4.1-nano", ModelPricing::with_cache(0.10, 0.40, 0.025));
    // o-series (reasoning)
    m.insert("o3", ModelPricing::with_cache(2.00, 8.00, 0.50));
    m.insert("o3-mini", ModelPricing::with_cache(1.10, 4.40, 0.55));
    m.insert("o4-mini", ModelPricing::with_cache(1.10, 4.40, 0.275));
    m.insert("o1", ModelPricing::with_cache(15.00, 60.00, 7.50));
    m.insert("o1-mini", ModelPricing::with_cache(1.10, 4.40, 0.55));
    m.insert("o1-preview", ModelPricing::with_cache(15.00, 60.00, 7.50));
    // GPT-3.5
    m.insert("gpt-3.5-turbo", ModelPricing::new(0.50, 1.50));
    // GPT-4 legacy
    m.insert("gpt-4", ModelPricing::new(30.00, 60.00));
    m.insert("gpt-4-turbo", ModelPricing::with_cache(10.00, 30.00, 5.00));
    // Copilot (proxied OpenAI, cost is $0 for the user but track notionally)
    m.insert("copilot", ModelPricing::new(0.0, 0.0));
    m
});

/// Look up pricing for a model name.  Tries exact match, then prefix/contains
/// matching for versioned model names (e.g. "gpt-4o-2024-08-06" → "gpt-4o").
pub fn lookup_pricing(model: &str) -> Option<&'static ModelPricing> {
    // Exact match.
    if let Some(p) = PRICING_TABLE.get(model) {
        return Some(p);
    }
    // Try prefix matching: find the longest key that is a prefix of the model name.
    let mut best: Option<(&str, &ModelPricing)> = None;
    for (key, pricing) in PRICING_TABLE.iter() {
        if model.starts_with(key) && best.is_none_or(|(bk, _)| key.len() > bk.len()) {
            best = Some((key, pricing));
        }
    }
    best.map(|(_, p)| p)
}

/// Estimate cost in USD for a single model call.
pub fn estimate_cost(usage: &super::TokenUsage) -> Option<f64> {
    let pricing = lookup_pricing(&usage.model)?;
    let input_tokens = usage.prompt_tokens.saturating_sub(usage.cached_tokens);
    let mut cost = (input_tokens as f64 / 1_000_000.0) * pricing.input_per_1m
        + (usage.completion_tokens as f64 / 1_000_000.0) * pricing.output_per_1m;
    if let Some(cached_rate) = pricing.cached_per_1m {
        cost += (usage.cached_tokens as f64 / 1_000_000.0) * cached_rate;
    }
    Some(cost)
}
