export interface ModelRequest {
  id: string;
  type: "model_request";
  request_id: string;
  agent: string;
  session: string | null;
  timestamp: string | number;
  message_count: number;
  function_count: number;
  estimated_tokens: number;
  function_names: string[];
  provider: string;
  model: string;
}

export interface ModelRequestDetail extends ModelRequest {
  messages: unknown[];
  functions: unknown[];
}

export interface ModelRequestsResponse {
  requests: ModelRequest[];
}
