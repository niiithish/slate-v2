use chrono::{NaiveDate, NaiveTime};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum HabitStatus {
    Pending,
    Avoided,
    Slipped,
}

impl HabitStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            HabitStatus::Pending => "pending",
            HabitStatus::Avoided => "avoided",
            HabitStatus::Slipped => "slipped",
        }
    }

    pub fn from_str(value: &str) -> Self {
        match value {
            "avoided" => HabitStatus::Avoided,
            "slipped" => HabitStatus::Slipped,
            _ => HabitStatus::Pending,
        }
    }

    pub fn parse_set_status(value: &str) -> Result<Self, HabitStatusParseError> {
        match value {
            "avoided" => Ok(HabitStatus::Avoided),
            "slipped" => Ok(HabitStatus::Slipped),
            _ => Err(HabitStatusParseError(value.to_string())),
        }
    }
}

#[derive(Debug, Error)]
#[error("invalid habit status: {0}")]
pub struct HabitStatusParseError(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub token: String,
    pub user: User,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Routine {
    pub id: String,
    pub title: String,
    pub days: Vec<u8>,
    pub start_time: String,
    pub end_time: String,
    pub color: String,
    pub reminder_enabled: bool,
}

impl Routine {
    pub fn into_schedule(self) -> Result<RoutineSchedule, String> {
        let start = NaiveTime::parse_from_str(&self.start_time, "%H:%M")
            .map_err(|_| "invalid routine start time".to_string())?;
        let end = NaiveTime::parse_from_str(&self.end_time, "%H:%M")
            .map_err(|_| "invalid routine end time".to_string())?;
        Ok(RoutineSchedule {
            id: self.id,
            title: self.title,
            days: self.days,
            start_time: start,
            end_time: end,
            reminder_enabled: self.reminder_enabled,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Habit {
    pub id: String,
    pub title: String,
    pub color: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HabitEntry {
    pub habit_id: String,
    pub title: String,
    pub color: String,
    pub status: HabitStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct DailyLog {
    pub trading_profit: Option<f64>,
    pub book_title: Option<String>,
    pub book_description: Option<String>,
    pub water_ml: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodayState {
    pub date: String,
    pub locked: bool,
    pub entries: Vec<HabitEntry>,
    pub progress: f64,
    pub current_streak: u32,
    pub routines: Vec<Routine>,
    #[serde(default)]
    pub daily_log: DailyLog,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HeatmapCell {
    pub date: String,
    pub avoided: u32,
    pub slipped: u32,
    pub total: u32,
    pub completion_rate: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HabitStreak {
    pub habit_id: String,
    pub title: String,
    pub current_streak: u32,
    pub best_streak: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsState {
    pub heatmap: Vec<HeatmapCell>,
    pub streaks: Vec<HabitStreak>,
    pub total_avoided: u32,
    pub total_slipped: u32,
    pub days_locked: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthResponse {
    pub ok: bool,
    pub database: bool,
    pub version: String,
}

#[derive(Debug, Clone)]
pub struct DayLog {
    pub date: NaiveDate,
    pub habit_id: String,
    pub status: HabitStatus,
}

#[derive(Debug, Clone)]
pub struct RoutineSchedule {
    pub id: String,
    pub title: String,
    pub days: Vec<u8>,
    pub start_time: NaiveTime,
    pub end_time: NaiveTime,
    pub reminder_enabled: bool,
}
