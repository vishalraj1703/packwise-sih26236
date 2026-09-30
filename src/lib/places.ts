import type { Place } from "../../shared/engine/journey";

// Offline place list so journeys can be described without connectivity.
export const PRESET_PLACES: Place[] = [
  { name: "Panruti, Cuddalore, Tamil Nadu", lat: 11.776, lon: 79.552, state: "Tamil Nadu" },
  { name: "Chennai, Tamil Nadu", lat: 13.083, lon: 80.27, state: "Tamil Nadu" },
  { name: "Cuddalore, Tamil Nadu", lat: 11.748, lon: 79.768, state: "Tamil Nadu" },
  { name: "Puducherry", lat: 11.934, lon: 79.83, state: "Puducherry" },
  { name: "Krishnagiri, Tamil Nadu", lat: 12.519, lon: 78.214, state: "Tamil Nadu" },
  { name: "Coimbatore, Tamil Nadu", lat: 11.017, lon: 76.956, state: "Tamil Nadu" },
  { name: "Madurai, Tamil Nadu", lat: 9.925, lon: 78.12, state: "Tamil Nadu" },
  { name: "Salem, Tamil Nadu", lat: 11.664, lon: 78.146, state: "Tamil Nadu" },
  { name: "Tiruchirappalli, Tamil Nadu", lat: 10.79, lon: 78.705, state: "Tamil Nadu" },
  { name: "Bengaluru, Karnataka", lat: 12.972, lon: 77.595, state: "Karnataka" },
  { name: "Kochi, Kerala", lat: 9.931, lon: 76.267, state: "Kerala" },
  { name: "Hyderabad, Telangana", lat: 17.385, lon: 78.487, state: "Telangana" },
  { name: "Ratnagiri, Maharashtra", lat: 16.99, lon: 73.312, state: "Maharashtra" },
  { name: "Pune, Maharashtra", lat: 18.52, lon: 73.857, state: "Maharashtra" },
  { name: "Mumbai, Maharashtra", lat: 19.076, lon: 72.878, state: "Maharashtra" },
  { name: "Nashik, Maharashtra", lat: 19.997, lon: 73.79, state: "Maharashtra" },
  { name: "New Delhi, Delhi", lat: 28.614, lon: 77.209, state: "Delhi" },
  { name: "Kolkata, West Bengal", lat: 22.573, lon: 88.364, state: "West Bengal" }
];
