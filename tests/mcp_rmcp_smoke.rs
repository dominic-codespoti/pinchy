use rmcp::{
    service::RunningService, transport::StreamableHttpClientTransport, RoleClient, ServiceExt,
};

#[tokio::test]
async fn connect_and_list_tools_workoutquest() {
    let transport = StreamableHttpClientTransport::from_uri(
        "https://workoutquest.azurewebsites.net/mcp".to_string(),
    );
    let client: RunningService<RoleClient, ()> = ()
        .serve(transport)
        .await
        .expect("Failed to connect to WorkoutQuest MCP server");

    let tools = client.list_all_tools().await.expect("Failed to list tools");

    assert!(
        !tools.is_empty(),
        "Expected at least one tool from WorkoutQuest"
    );

    for t in &tools {
        eprintln!("  tool: {} — {:?}", t.name, t.description);
    }

    let _ = client.cancel().await;
}
