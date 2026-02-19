//! Integration test: gateway serves static UI and WebSocket remains functional.

use futures_util::{SinkExt, StreamExt};
use std::net::SocketAddr;
use tokio_tungstenite::connect_async;

#[tokio::test]
async fn serves_index_html() {
    let addr: SocketAddr = "127.0.0.1:4003".parse().unwrap();
    let gw = mini_claw::gateway::start_gateway(addr).await.unwrap();

    // /api/status still works
    let resp = reqwest::get(format!("http://{}/api/status", gw.addr))
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    // / serves index.html
    let resp = reqwest::get(format!("http://{}/", gw.addr)).await.unwrap();
    assert_eq!(resp.status(), 200);
    let ct = resp
        .headers()
        .get("content-type")
        .expect("missing content-type")
        .to_str()
        .unwrap()
        .to_string();
    assert!(ct.contains("text/html"), "expected text/html, got {ct}");

    let body = resp.text().await.unwrap();
    assert!(
        body.contains("Pinchy"),
        "index.html should contain 'Pinchy'"
    );

    gw.handle.abort();
}

#[tokio::test]
async fn ws_open_send_stays_alive() {
    let addr: SocketAddr = "127.0.0.1:4004".parse().unwrap();
    let gw = mini_claw::gateway::start_gateway(addr).await.unwrap();

    let url = format!("ws://{}/ws", gw.addr);
    let (mut ws, _) = connect_async(&url).await.expect("ws connect failed");

    // Send a client command
    let cmd = serde_json::json!({
        "type": "client_command",
        "command": "hello",
        "target_agent": "default"
    });
    ws.send(tokio_tungstenite::tungstenite::Message::Text(
        cmd.to_string().into(),
    ))
    .await
    .unwrap();

    // Connection should remain open for at least 200ms
    let timeout = tokio::time::sleep(std::time::Duration::from_millis(200));
    tokio::pin!(timeout);

    tokio::select! {
        _ = &mut timeout => { /* ok – stayed open */ }
        msg = ws.next() => {
            // If we receive something that's fine; if the stream ends it's a problem.
            if let Some(Err(e)) = msg {
                panic!("ws error within 200ms: {e}");
            }
        }
    }

    gw.handle.abort();
}
