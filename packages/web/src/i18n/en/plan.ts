// SPDX-License-Identifier: AGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Quentin Donnars

import type { plan as frPlan } from "../fr/plan";

export const plan: Record<keyof typeof frPlan, string> = {
  // ── PlanPage ──────────────────────────────────────────────────────────────
  "plan.page.urlError.title": "Invalid URL",
  "plan.page.urlError.back": "← Explore the weather",
  "plan.page.backToExplore": "Back to exploring",
  "plan.page.hint.placeStart": "Click to place the departure",
  "plan.page.hint.drawRoute": "Click to draw your route",
  "plan.panel.resize": "Resize the panel",

  // ── Totals: panel block and mobile strip ──────────────────────────────────
  "plan.hero.distance": "Distance",
  "plan.hero.duration": "Duration",
  "plan.hero.arrival": "Arrival",
  "plan.hero.openDetail": "See the passage detail",

  // ── Segment bar, under the totals ─────────────────────────────────────────
  "plan.segmentBar.groupLabel": "Passage steps, a click opens the step",
  "plan.segmentBar.progressLabel": "Wind distribution by segment",
  "plan.segmentBar.stepLabel":
    "Leg {from}→{to}, step {index} of {total}, {start} → {end}, {tws} kn",
  "plan.segmentBar.timeLabel": "{start} → {end}, {tws} kn",

  // ── Panel states ──────────────────────────────────────────────────────────
  "plan.states.empty.title": "Draw your route",
  "plan.states.empty.body":
    "Click on the map to place a departure and an arrival. You can then simulate the passage time or compare several departure windows.",
  "plan.states.picker.title": "What would you like to do?",
  "plan.states.picker.single.body":
    "You know when you are leaving. OhMyWind works out the passage time, the ETA and the conditions on every segment.",
  "plan.states.picker.single.example":
    "E.g. “If I leave on Saturday at 17:00, when do I arrive?”",
  "plan.states.picker.compare.body":
    "You know where you are going. OhMyWind tries several departure times and ranks the windows by comfort.",
  "plan.states.picker.compare.example":
    "E.g. “Which is the best departure between Saturday and Monday?”",
  "plan.states.error.title": "Error",
  "plan.recap.edit": "Edit",

  // ── Mode picker and time anchor ───────────────────────────────────────────
  "plan.mode.tablist": "Planning mode",
  "plan.mode.single.title": "Simulate my route",
  "plan.mode.single.sub": "How long for this passage?",
  "plan.mode.compare.title": "Compare the windows",
  "plan.mode.compare.sub": "The best window to set off?",
  "plan.timeAnchor.tablist": "Time anchor",
  "plan.timeAnchor.departure.title": "Set the departure",
  "plan.timeAnchor.departure.sub": "Work out the passage time",
  "plan.timeAnchor.arrival.title": "Set the arrival",
  "plan.timeAnchor.arrival.sub": "How late can you leave?",

  // ── Steps of a leg ────────────────────────────────────────────────────────
  "plan.steps.groupLabel": "Computation steps of the leg",
  "plan.steps.stepLabel": "Step {index} of {total}, {time}",
  "plan.steps.viewToggle.label": "Leg display",
  "plan.steps.viewToggle.average": "Average",
  "plan.steps.viewToggle.detail": "Detail",

  // ── Map ───────────────────────────────────────────────────────────────────
  "plan.map.waypoint.remove": "Remove this waypoint",

  // ── Comparison window validation ──────────────────────────────────────────
  "plan.sweep.errors.missingWindow": "Enter a departure window.",
  "plan.sweep.errors.invalidDates": "Invalid dates.",
  "plan.sweep.errors.latestBeforeEarliest":
    "The “latest” must come after the “earliest”.",
  "plan.sweep.errors.beyondHorizon":
    "The forecast is only reliable {days} days ahead. Pick an earlier date.",
  "plan.sweep.errors.tooManyWindows":
    "Too many windows to compare ({windows}). Shorten the window or increase the step.",

  // ── URL parsing ───────────────────────────────────────────────────────────
  "plan.url.errors.tooFewWaypoints": "At least 2 waypoints required",
  "plan.url.errors.invalidWaypoint": 'invalid waypoint: "{value}"',
  "plan.url.errors.latitudeOutOfRange": "latitude out of range: {value}",
  "plan.url.errors.longitudeOutOfRange": "longitude out of range: {value}",
  "plan.url.errors.invalidWaypoints": "Invalid waypoints: {detail}",

  // ── Passage API errors ────────────────────────────────────────────────────
  "plan.api.errors.retryDelay.vague": "Wait a few minutes before starting again.",
  "plan.api.errors.retryDelay.seconds.one": "Wait {count} second before starting again.",
  "plan.api.errors.retryDelay.seconds.other": "Wait {count} seconds before starting again.",
  "plan.api.errors.retryDelay.minutes.one": "Wait {count} minute before starting again.",
  "plan.api.errors.retryDelay.minutes.other": "Wait {count} minutes before starting again.",
  "plan.api.errors.serverStatus": "Server error {status}",
  "plan.api.errors.forecastHorizon":
    "The weather service could not cover this period. Pick a closer date (up to about 10 days, depending on the model). To keep your planning, do not reload the page until you have adjusted the date.",
  "plan.api.errors.tooFewWaypoints":
    "Place at least 2 waypoints on the map to compute a route.",
  "plan.api.errors.waypointOutOfRange":
    "A waypoint lies outside valid coordinates. Place it again on the map.",
  "plan.api.errors.tooManyWaypoints":
    "Too many waypoints on this route. Remove a few of them to simplify it.",
  "plan.api.errors.rateLimited": "Too many computations one after the other. {delay}",
  "plan.api.errors.unknownArchetype":
    "Unknown boat type. Select an archetype from the list.",
  "plan.api.errors.invalidDatetime": "Invalid date. Check the format of the date fields.",
  "plan.api.errors.naiveDatetime": "The arrival time must include the time zone.",
  "plan.api.errors.sweepTooLarge":
    "Too many windows to compare. Shorten the window or increase the sampling step.",
  "plan.api.errors.upstreamTimeout":
    "The weather service took too long to answer. Try again in a moment.",
  "plan.api.errors.upstreamRateLimited":
    "The weather service is temporarily throttling our requests. This is not down to your usage, try again in a few minutes.",
  "plan.api.errors.upstreamUnavailable":
    "The server is momentarily unreachable, it may be restarting. {delay}",
  "plan.api.errors.bodyTooLarge":
    "The route is too detailed to be sent. Remove a few waypoints or shorten the period.",
  "plan.api.errors.invalidForecastCache":
    "The weather data prepared by the browser was rejected. Try again: the computation will start from the server's data.",
  "plan.api.errors.serverUnavailable":
    "The weather server is unavailable. Try again in a moment.",
  "plan.api.errors.networkUnreachable":
    "Cannot reach the server. Check your connection, then try again.",
  "plan.api.errors.invalidResponse":
    "The server returned an unexpected response. Try again in a moment.",
};
