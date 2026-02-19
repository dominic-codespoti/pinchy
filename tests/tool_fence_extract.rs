//! Unit-style tests for the fenced JSON extraction helpers.

use mini_claw::tools::parsing::{extract_fenced_json, is_tool_call_only};

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
    let input = "Sure, I'll read the file.\n```json\n{\"name\": \"read_file\"}\n```\nHere you go.";
    let result = extract_fenced_json(input);
    assert!(result.is_some(), "should still extract the fenced block");
    assert!(
        !is_tool_call_only(input),
        "extra surrounding text means not tool-call-only"
    );
}

#[test]
fn json_with_braces_in_strings() {
    let input =
        "```json\n{\"name\": \"write_file\", \"args\": {\"content\": \"hello { world }\"}}\n```";
    let result = extract_fenced_json(input).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&result).unwrap();
    assert_eq!(parsed["name"], "write_file");
    assert_eq!(parsed["args"]["content"], "hello { world }");
    assert!(is_tool_call_only(input));
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
    let req: mini_claw::tools::parsing::ToolRequest = serde_json::from_str(&json_str).unwrap();
    assert_eq!(req.name, "exec_shell");
}
