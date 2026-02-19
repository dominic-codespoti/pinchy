//! Pure string-parsing helpers for extracting tool-call blocks from LLM
//! replies.
//!
//! These utilities are provider-agnostic and operate entirely on the text
//! content of a model response.  They are used by the agent runtime to
//! detect fenced ```` ```json ```` tool-call blocks and by tests to
//! validate parsing behaviour.

/// A parsed tool invocation request from the LLM reply.
#[derive(Debug, serde::Deserialize)]
pub struct ToolRequest {
    pub name: String,
    pub args: serde_json::Value,
}

/// Extract the first ` ```json ` fenced code block and the remaining
/// (surrounding) text from `reply`.
///
/// Returns `Some((json_content, remaining_text))` when a fenced block
/// is found.  `remaining_text` is built by stripping the fenced block
/// and trimming; it may be empty.
pub fn extract_tool_call_block(reply: &str) -> Option<(String, String)> {
    let text = reply.replace("\r\n", "\n");
    let open = text.find("```json")?;
    let after_tag = &text[open + 7..]; // skip ```json
    let nl = after_tag.find('\n')?;
    let inner_start = open + 7 + nl + 1;
    let inner_text = &text[inner_start..];
    let close = inner_text.find("\n```")?;
    let json_content = inner_text[..close].to_string();

    // Build remaining text by stripping the fenced block.
    let block_end = inner_start + close + 4; // past \n```
    let before = text[..open].trim();
    let after = if block_end < text.len() {
        text[block_end..].trim()
    } else {
        ""
    };
    let remaining = format!(
        "{}{}{}",
        before,
        if !before.is_empty() && !after.is_empty() {
            "\n"
        } else {
            ""
        },
        after
    )
    .trim()
    .to_string();

    Some((json_content, remaining))
}

/// Extract the inner content of the first ` ```json ` fenced code block.
///
/// Handles CRLF line endings and optional whitespace after the language tag.
/// Returns `None` if no fenced block is found.
pub fn extract_fenced_json(reply: &str) -> Option<String> {
    extract_tool_call_block(reply).map(|(json, _)| json)
}

/// Return `true` when `reply` contains exactly one fenced json block
/// (optionally surrounded by whitespace/newlines) and nothing else.
pub fn is_tool_call_only(reply: &str) -> bool {
    match extract_tool_call_block(reply) {
        Some((_, remaining)) => remaining.is_empty(),
        None => false,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_fenced_json() {
        let input = "```json\n{\"name\": \"read_file\", \"args\": {\"path\": \"hello.txt\"}}\n```";
        let result = extract_fenced_json(input).unwrap();
        assert_eq!(
            result,
            "{\"name\": \"read_file\", \"args\": {\"path\": \"hello.txt\"}}"
        );
        assert!(is_tool_call_only(input));
    }

    #[test]
    fn fenced_json_with_surrounding_whitespace() {
        let input = "\n  \n```json\n{\"name\": \"exec_shell\"}\n```\n  \n";
        let result = extract_fenced_json(input).unwrap();
        assert_eq!(result, "{\"name\": \"exec_shell\"}");
        assert!(is_tool_call_only(input));
    }

    #[test]
    fn fenced_json_with_extra_text_not_tool_only() {
        let input =
            "Sure, I'll read the file.\n```json\n{\"name\": \"read_file\"}\n```\nHere you go.";
        let result = extract_fenced_json(input);
        assert!(result.is_some());
        assert!(!is_tool_call_only(input));
    }

    #[test]
    fn no_fenced_block_returns_none() {
        assert!(extract_fenced_json("just plain text").is_none());
        assert!(!is_tool_call_only("just plain text"));
    }

    #[test]
    fn crlf_line_endings() {
        let input = "```json\r\n{\"name\": \"read_file\"}\r\n```";
        let result = extract_fenced_json(input).unwrap();
        assert_eq!(result, "{\"name\": \"read_file\"}");
        assert!(is_tool_call_only(input));
    }

    #[test]
    fn tool_request_parsed() {
        let input = "```json\n{\"name\": \"exec_shell\", \"args\": {\"command\": \"ls\"}}\n```";
        let json_str = extract_fenced_json(input).unwrap();
        let req: ToolRequest = serde_json::from_str(&json_str).unwrap();
        assert_eq!(req.name, "exec_shell");
    }
}
