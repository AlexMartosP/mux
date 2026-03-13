use actix_web::{get, post, web, HttpResponse, Responder};
use serde::Deserialize;
use utoipa::{OpenApi, ToSchema};

use crate::domains::agent::agent_db;
use crate::domains::agent::agent_model::{Agent, CreateAgent};
use crate::domains::agent::agent_service;
use crate::domains::message::message_db;
use crate::domains::message::message_model::Message;
use crate::domains::agent_step::agent_step_db;
use crate::domains::agent_step::agent_step_model::AgentStep;
use crate::domains::repository::repository_service;

#[derive(Debug, Deserialize, ToSchema)]
struct CreateAgentBody {
    repository_id: String,
    name: String,
    base_branch: String,
    initial_message: String,
}

#[derive(Debug, Deserialize, ToSchema)]
struct SendMessageBody {
    content: String,
}

#[utoipa::path(
    request_body = CreateAgentBody,
    responses(
        (status = 201, description = "Created", body = Agent),
        (status = 400, description = "Bad Request"),
        (status = 500, description = "Internal Server Error"),
    )
)]
#[post("/agents")]
async fn create_agent(body: web::Json<CreateAgentBody>) -> impl Responder {
    let body = body.into_inner();

    let repository = match repository_service::get_repository(&body.repository_id).await {
        Ok(Some(repo)) => repo,
        Ok(None) => return HttpResponse::BadRequest().json("Repository not found"),
        Err(_) => return HttpResponse::InternalServerError().finish(),
    };

    match agent_service::create_agent(
        CreateAgent {
            workspace_id: repository.workspace_id.clone(),
            repository_id: body.repository_id,
            name: body.name,
            base_branch: body.base_branch,
            initial_message: body.initial_message,
        },
        repository,
    )
    .await
    {
        Ok(agent) => HttpResponse::Created().json(agent),
        Err(e) => HttpResponse::InternalServerError().json(e.to_string()),
    }
}

#[utoipa::path(
    responses(
        (status = 200, description = "OK", body = Agent),
        (status = 404, description = "Not Found"),
    )
)]
#[get("/agents/{agent_id}")]
async fn get_agent(path: web::Path<String>) -> impl Responder {
    let agent_id = path.into_inner();

    match agent_db::get(&agent_id).await {
        Ok(Some(agent)) => HttpResponse::Ok().json(agent),
        Ok(None) => HttpResponse::NotFound().json("Agent not found"),
        Err(_) => HttpResponse::InternalServerError().finish(),
    }
}

#[utoipa::path(
    responses(
        (status = 200, description = "OK", body = Vec<Message>),
        (status = 404, description = "Not Found"),
    )
)]
#[get("/agents/{agent_id}/messages")]
async fn list_agent_messages(path: web::Path<String>) -> impl Responder {
    let agent_id = path.into_inner();

    match message_db::list_by_agent(&agent_id).await {
        Ok(messages) => HttpResponse::Ok().json(messages),
        Err(_) => HttpResponse::InternalServerError().finish(),
    }
}

#[utoipa::path(
    responses(
        (status = 200, description = "OK", body = Vec<AgentStep>),
    )
)]
#[get("/agents/{agent_id}/steps")]
async fn list_agent_steps(path: web::Path<String>) -> impl Responder {
    let agent_id = path.into_inner();

    match agent_step_db::list_by_agent(&agent_id).await {
        Ok(steps) => HttpResponse::Ok().json(steps),
        Err(_) => HttpResponse::InternalServerError().finish(),
    }
}

#[utoipa::path(
    request_body = SendMessageBody,
    responses(
        (status = 200, description = "OK"),
        (status = 400, description = "Agent not in idle state"),
        (status = 404, description = "Not Found"),
    )
)]
#[post("/agents/{agent_id}/messages")]
async fn send_agent_message(
    path: web::Path<String>,
    body: web::Json<SendMessageBody>,
) -> impl Responder {
    let agent_id = path.into_inner();
    let body = body.into_inner();

    match agent_service::send_followup_message(&agent_id, &body.content).await {
        Ok(()) => HttpResponse::Ok().json("Message sent"),
        Err(crate::domains::agent::agent_error::AgentError::NotFound) => {
            HttpResponse::NotFound().json("Agent not found")
        }
        Err(crate::domains::agent::agent_error::AgentError::InvalidState) => {
            HttpResponse::BadRequest().json("Agent is not idle")
        }
        Err(e) => HttpResponse::InternalServerError().json(e.to_string()),
    }
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(create_agent)
        .service(get_agent)
        .service(list_agent_messages)
        .service(list_agent_steps)
        .service(send_agent_message);
}

pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(OpenApi)]
    #[openapi(
        paths(create_agent, get_agent, list_agent_messages, list_agent_steps, send_agent_message),
        components(schemas(
            Agent,
            AgentStep,
            Message,
            CreateAgentBody,
            SendMessageBody,
        ))
    )]
    struct AgentApi;
    AgentApi::openapi()
}
