//! Verify that `gateway::publish_event_json` is callable and does not panic
//! even when the gateway is not running (no global sender registered).

#[test]
fn publish_event_json_noop_when_gateway_disabled() {
    // No gateway has been started, so global_events_tx() is None.
    // publish_event_json should silently no-op.
    let value = serde_json::json!({
        "type": "test",
        "msg": "hello",
    });
    mini_claw::gateway::publish_event_json(&value);
    // If we reach here without panic, the test passes.
}

#[tokio::test]
async fn publish_event_json_delivers_when_gateway_running() {
    use std::net::SocketAddr;

    let addr: SocketAddr = "127.0.0.1:4010".parse().unwrap();
    let gw = mini_claw::gateway::start_gateway(addr).await.unwrap();

    // Register the sender globally (normally done by spawn_gateway_if_enabled).
    mini_claw::gateway::set_global_events_tx(gw.events_tx.clone());

    let mut rx = gw.events_tx.subscribe();

    let value = serde_json::json!({ "type": "test", "data": 42 });
    mini_claw::gateway::publish_event_json(&value);

    let received = tokio::time::timeout(std::time::Duration::from_secs(2), rx.recv())
        .await
        .expect("timeout")
        .expect("recv error");

    let parsed: serde_json::Value = serde_json::from_str(&received).unwrap();
    assert_eq!(parsed["type"], "test");
    assert_eq!(parsed["data"], 42);

    gw.handle.abort();
}
