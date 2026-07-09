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

    pub fn parse(value: &str) -> Self {
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
    pub fn validate_fields(
        title: &str,
        days: &[u8],
        start_time: &str,
        end_time: &str,
    ) -> Result<(), String> {
        if title.trim().is_empty() {
            return Err("routine title is required".into());
        }
        if days.is_empty() {
            return Err("select at least one day".into());
        }
        if days.iter().any(|day| *day > 6) {
            return Err("routine days must be between 0 (Mon) and 6 (Sun)".into());
        }
        let _start = NaiveTime::parse_from_str(start_time, "%H:%M")
            .map_err(|_| "invalid routine start time".to_string())?;
        let _end = NaiveTime::parse_from_str(end_time, "%H:%M")
            .map_err(|_| "invalid routine end time".to_string())?;
        Ok(())
    }

    pub fn into_schedule(self) -> Result<RoutineSchedule, String> {
        Self::validate_fields(&self.title, &self.days, &self.start_time, &self.end_time)?;
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderPreferences {
    #[serde(default)]
    pub routine_offset_minutes: i32,
    #[serde(default = "default_true")]
    pub evening_reminder_enabled: bool,
    #[serde(default = "default_evening_hour")]
    pub evening_hour: u32,
    #[serde(default)]
    pub evening_minute: u32,
    #[serde(default = "default_true")]
    pub water_reminders_enabled: bool,
}

fn default_true() -> bool {
    true
}

fn default_evening_hour() -> u32 {
    22
}

impl Default for ReminderPreferences {
    fn default() -> Self {
        Self {
            routine_offset_minutes: 0,
            evening_reminder_enabled: true,
            evening_hour: 22,
            evening_minute: 0,
            water_reminders_enabled: true,
        }
    }
}

impl ReminderPreferences {
    /// Clamp preference fields into ranges the scheduler can use.
    pub fn sanitized(self) -> Self {
        Self {
            routine_offset_minutes: self.routine_offset_minutes.clamp(0, 180),
            evening_reminder_enabled: self.evening_reminder_enabled,
            evening_hour: self.evening_hour.min(23),
            evening_minute: self.evening_minute.min(59),
            water_reminders_enabled: self.water_reminders_enabled,
        }
    }
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
