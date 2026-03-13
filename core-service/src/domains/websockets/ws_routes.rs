use actix_web::{get, web, HttpRequest, Responder};
use actix_ws::Message;
use futures_util::StreamExt;
use tokio::select;

use super::ws_broadcaster;

#[get("/agents/{agent_id}/ws")]
async fn agent_ws(
    req: HttpRequest,
    stream: web::Payload,
    path: web::Path<String>,
) -> impl Responder {
    let agent_id = path.into_inner();
    let (response, mut session, mut msg_stream) = match actix_ws::handle(&req, stream) {
        Ok(res) => res,
        Err(e) => return e.error_response(),
    };

    let mut rx = ws_broadcaster::subscribe(&agent_id);

    actix_web::rt::spawn(async move {
        loop {
            select! {
                event = rx.recv() => {
                    match event {
                        Ok(evt) => {
                            let json = serde_json::to_string(&evt).unwrap_or_default();
                            if session.text(json).await.is_err() {
                                break;
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(_) => break,
                    }
                }
                msg = msg_stream.next() => {
                    match msg {
                        Some(Ok(Message::Ping(bytes))) => {
                            let _ = session.pong(&bytes).await;
                        }
                        Some(Ok(Message::Close(_))) | None => break,
                        _ => {}
                    }
                }
            }
        }
        let _ = session.close(None).await;
    });

    response
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(agent_ws);
}
