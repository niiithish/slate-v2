use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::rngs::OsRng;

use crate::db::{DbError, DbResult, DatabaseState};
use crate::models::{Session, User};

pub fn hash_password(password: &str) -> DbResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| DbError::InvalidInput(e.to_string()))?
        .to_string();
    Ok(hash)
}

pub fn verify_password(password: &str, password_hash: &str) -> DbResult<bool> {
    let parsed = PasswordHash::new(password_hash)
        .map_err(|e| DbError::InvalidInput(e.to_string()))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

pub async fn register_user(
    db: &DatabaseState,
    email: &str,
    password: &str,
    display_name: &str,
) -> DbResult<Session> {
    if email.trim().is_empty() || password.len() < 8 {
        return Err(DbError::InvalidInput(
            "email required and password must be at least 8 characters".into(),
        ));
    }
    if db.find_user_by_email(email).await?.is_some() {
        return Err(DbError::InvalidInput("email already registered".into()));
    }
    let hash = hash_password(password)?;
    let user = db.register(email, &hash, display_name).await?;
    db.create_session(&user).await
}

pub async fn login_user(db: &DatabaseState, email: &str, password: &str) -> DbResult<Session> {
    let Some((user, hash)) = db.find_user_by_email(email).await? else {
        return Err(DbError::Unauthorized);
    };
    if !verify_password(password, &hash)? {
        return Err(DbError::Unauthorized);
    }
    db.create_session(&user).await
}

pub async fn resolve_user(db: &DatabaseState, token: &str) -> DbResult<User> {
    db.resolve_session(token).await
}