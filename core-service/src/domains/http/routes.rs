use actix_web::web;
use crate::domains::agent::agent_routes;
use crate::domains::workspace::workspace_routes;
use crate::domains::repository::repository_routes;
use crate::domains::websockets::ws_routes;

pub fn routes(cfg: &mut web::ServiceConfig) {
    cfg.configure(workspace_routes::config)
       .configure(repository_routes::config)
       .configure(agent_routes::config)
       .configure(ws_routes::config);
}
