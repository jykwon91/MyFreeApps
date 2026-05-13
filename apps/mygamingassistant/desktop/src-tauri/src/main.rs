// Prevent an additional console window from showing on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mygamingassistant_lib::run();
}
