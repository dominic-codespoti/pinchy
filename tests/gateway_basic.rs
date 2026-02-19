//! Basic integration test for the gateway HTTP + WebSocket server.

use futures_util::{SinkExt, StreamExt};
use std::net::SocketAddr;
use tokio_tungstenite::connect_async;

#[tokio::test]
async fn status_endpoint_returns_ok() {
    let addr: SocketAddr = "127.0.0.1:4001".parse().unwrap();
    let gw = mini_claw::gateway::start_gateway(addr).await.unwrap();

    let resp = reqwest::get(format!("http://{}/api/status", gw.addr))
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["status"], "ok");

    gw.handle.abort();
}

#[tokio::test]
async fn websocket_echo_round_trip() {
    let addr: SocketAddr = "127.0.0.1:4002".parse().unwrap();
    let mut gw = mini_claw::gateway::start_gateway(addr).await.unwrap();

    let url = format!("ws://{}/ws", gw.addr);
    let (mut ws, _) = connect_async(&url).await.expect("ws connect failed");

    // Broadcast an event; connected client should receive it.
    gw.events_tx.send("hello from server".to_string()).unwrap();

    // The gateway sends initial messages on connect (agent_list, session
    // history). Drain messages until we find our broadcast.
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(3);
    let mut found = false;
    while tokio::time::Instant::now() < deadline {
        let msg = tokio::time::timeout(std::time::Duration::from_secs(2), ws.next())
            .await
            .expect("timeout waiting for ws message")
            .expect("stream ended")
            .expect("ws error");
        if msg == tokio_tungstenite::tungstenite::Message::Text("hello from server".into()) {
            found = true;
            break;
        }
    }
    assert!(found, "should have received 'hello from server' broadcast");

    // Client sends a command; should appear on commands_rx.
    ws.send(tokio_tungstenite::tungstenite::Message::Text(
        "cmd:ping".into(),
    ))
    .await
    .unwrap();

    let cmd = tokio::time::timeout(std::time::Duration::from_secs(2), gw.commands_rx.recv())
        .await
        .expect("timeout waiting for command")
        .expect("commands channel closed");

    assert_eq!(cmd, "cmd:ping");

    gw.handle.abort();
}
