/**
 * Comprehensive India-wide bus route seed script.
 *
 * Creates 55+ cities, 100+ directional routes with realistic stops,
 * and 1000+ bus records across all routes.
 *
 * Usage:
 *   cd frontend/server
 *   node scripts/seedIndiaRoutes.js
 *
 * Requires MONGODB_URI in .env or defaults to mongodb://localhost:27017/tedbus
 */
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const Route = require("../models/route");
const Bus = require("../models/bus");

// ---------------------------------------------------------------------------
// 1. CITIES — 55+ major Indian cities with approximate lat/lng
// ---------------------------------------------------------------------------
const CITIES = {
  "Delhi":             { lat: 28.6139, lng: 77.2090 },
  "Mumbai":            { lat: 19.0760, lng: 72.8777 },
  "Bangalore":         { lat: 12.9716, lng: 77.5946 },
  "Chennai":           { lat: 13.0827, lng: 80.2707 },
  "Kolkata":           { lat: 22.5726, lng: 88.3639 },
  "Hyderabad":         { lat: 17.3850, lng: 78.4867 },
  "Ahmedabad":         { lat: 23.0225, lng: 72.5714 },
  "Pune":              { lat: 18.5204, lng: 73.8567 },
  "Jaipur":            { lat: 26.9124, lng: 75.7873 },
  "Lucknow":           { lat: 26.8467, lng: 80.9462 },
  "Kanpur":            { lat: 26.4499, lng: 80.3319 },
  "Nagpur":            { lat: 21.1458, lng: 79.0882 },
  "Indore":            { lat: 22.7196, lng: 75.8577 },
  "Bhopal":            { lat: 23.2599, lng: 77.4126 },
  "Patna":             { lat: 25.6093, lng: 85.1376 },
  "Vadodara":          { lat: 22.3072, lng: 73.1812 },
  "Surat":             { lat: 21.1702, lng: 72.8311 },
  "Coimbatore":        { lat: 11.0168, lng: 76.9558 },
  "Kochi":             { lat: 9.9312,  lng: 76.2673 },
  "Thiruvananthapuram": { lat: 8.5241, lng: 76.9366 },
  "Goa (Panaji)":      { lat: 15.4909, lng: 73.8278 },
  "Chandigarh":        { lat: 30.7333, lng: 76.7794 },
  "Amritsar":          { lat: 31.6340, lng: 74.8723 },
  "Jammu":             { lat: 32.7266, lng: 74.8570 },
  "Srinagar":          { lat: 34.0837, lng: 74.7973 },
  "Dehradun":          { lat: 30.3165, lng: 78.0322 },
  "Varanasi":          { lat: 25.3176, lng: 82.9739 },
  "Prayagraj":         { lat: 25.4358, lng: 81.8463 },
  "Bhubaneswar":       { lat: 20.2961, lng: 85.8245 },
  "Ranchi":            { lat: 23.3441, lng: 85.3096 },
  "Guwahati":          { lat: 26.1445, lng: 91.7362 },
  "Bhopal":            { lat: 23.2599, lng: 77.4126 },
  "Udaipur":           { lat: 24.5854, lng: 73.7125 },
  "Jodhpur":           { lat: 26.2389, lng: 73.0243 },
  "Agra":              { lat: 27.1767, lng: 78.0081 },
  "Madurai":           { lat: 9.9252,  lng: 78.1198 },
  "Mysore":            { lat: 12.2958, lng: 76.6394 },
  "Mangalore":         { lat: 12.9141, lng: 74.8560 },
  "Hubli":             { lat: 15.3647, lng: 75.1240 },
  "Belgaum":           { lat: 15.8497, lng: 74.4977 },
  "Nashik":            { lat: 19.9975, lng: 73.7898 },
  "Aurangabad":        { lat: 19.8762, lng: 75.3433 },
  "Solapur":           { lat: 17.6599, lng: 75.9064 },
  "Kolhapur":          { lat: 16.7050, lng: 74.2433 },
  "Tiruchirappalli":   { lat: 10.7905, lng: 78.7047 },
  "Salem":             { lat: 11.6643, lng: 78.1460 },
  "Erode":             { lat: 11.3410, lng: 77.7172 },
  "Visakhapatnam":     { lat: 17.6868, lng: 83.2185 },
  "Vijayawada":        { lat: 16.5062, lng: 80.6480 },
  "Guntur":            { lat: 16.3067, lng: 80.4365 },
  "Nellore":           { lat: 14.4426, lng: 79.9865 },
  "Raipur":            { lat: 21.2514, lng: 81.6296 },
  "Jabalpur":          { lat: 23.1815, lng: 79.9864 },
  "Gwalior":           { lat: 26.2183, lng: 78.1828 },
  "Meerut":            { lat: 28.9845, lng: 77.7064 },
  "Bareilly":          { lat: 28.3670, lng: 79.4304 },
  "Aligarh":           { lat: 27.8974, lng: 78.0880 },
  "Noida":             { lat: 28.5355, lng: 77.3910 },
  "Gurugram":          { lat: 28.4595, lng: 77.0266 },
  "Faridabad":         { lat: 28.4089, lng: 77.3178 },
  "Dhanbad":           { lat: 23.7957, lng: 86.4304 },
  "Siliguri":          { lat: 26.7271, lng: 88.3953 },
  "Durgapur":          { lat: 23.5204, lng: 87.3119 },
  "Asansol":           { lat: 23.6739, lng: 86.9524 },
  "Jamshedpur":        { lat: 22.8046, lng: 86.2029 },
  "Rajkot":            { lat: 22.3039, lng: 70.8022 },
  "Jamnagar":          { lat: 22.4707, lng: 70.0577 },
  "Kota":              { lat: 25.2138, lng: 75.8648 },
  "Vellore":           { lat: 12.9165, lng: 79.1325 },
  "Anantapur":         { lat: 14.6819, lng: 77.5858 },
  "Dibrugarh":         { lat: 27.4728, lng: 94.9120 },
  "Shillong":          { lat: 25.5788, lng: 91.8933 },
  "Vizag":             { lat: 17.6868, lng: 83.2185 },
  "Alwar":             { lat: 27.5530, lng: 76.6346 },
};

// ---------------------------------------------------------------------------
// 2. BUS OPERATORS — realistic Indian private/state operators
// ---------------------------------------------------------------------------
const OPERATORS = [
  "KSRTC", "APSRTC", "MSRTC", "RSRTC", "GSRTC", "BEST",
  "SETC", "TNSTC", "KSRTC Kerala", "KPN", "SRS Travels",
  "VRL Travels", "Sugama Tourists", "Neeta Travels",
  "Volvo Bus India", "Rajdhani Express", "Patel Travels",
  " Sharma Transports", "Durgamba Motors", "Barathi Bus",
  "Kaveri Travels", "Paulo Travels", "Mini Bus India",
  "HRTC", "UPSRTC", "SBSTC", "NBSTC", "PBSTC",
  "Chartered Bus", "Sree Travels", "Kallada Travels",
  "A1 Travels", "National Travels", "Modern Travels",
  "Laxmi Holidays", "Raj Express", "Heera Travels",
  "Shrinath Travels", "RLV Travels", "Prasanna Travels",
  "Rathod Travels", "Vijayanthara Travels", "Konduskar",
  "Sea Bird Tourists", "Dolphin Travels", "Asian Travels",
  "Greenline Travels", "BHARATHI BUS", "Sri Krishna Travels",
  "Jabbar Travels", "SRM Travels", "Parveen Travels",
  "KPN Travels", "Tata Motors", "Eva Travels",
  "Rajhans Travels", "Tulsi Travels", "Pooja Travels",
];

// ---------------------------------------------------------------------------
// 3. ROUTE DEFINITIONS — 100+ directional corridors
//    Each entry: [fromCity, toCity, distanceKm, estimatedHours, [intermediateStopCityKeys]]
// ---------------------------------------------------------------------------
const ROUTE_DEFS = [
  // ---- DELHI CORRIDORS ----
  ["Delhi", "Mumbai", 1400, 20, ["Jaipur", "Ahmedabad", "Vadodara", "Surat"]],
  ["Mumbai", "Delhi", 1400, 20, ["Surat", "Vadodara", "Ahmedabad", "Jaipur"]],
  ["Delhi", "Bangalore", 2100, 30, ["Hyderabad", "Nagpur"]],
  ["Bangalore", "Delhi", 2100, 30, ["Nagpur", "Hyderabad"]],
  ["Delhi", "Chennai", 2200, 32, ["Nagpur", "Hyderabad", "Vijayawada"]],
  ["Chennai", "Delhi", 2200, 32, ["Vijayawada", "Hyderabad", "Nagpur"]],
  ["Delhi", "Kolkata", 1450, 20, ["Kanpur", "Prayagraj", "Varanasi"]],
  ["Kolkata", "Delhi", 1450, 20, ["Varanasi", "Prayagraj", "Kanpur"]],
  ["Delhi", "Hyderabad", 1550, 22, ["Nagpur", "Aurangabad"]],
  ["Hyderabad", "Delhi", 1550, 22, ["Aurangabad", "Nagpur"]],
  ["Delhi", "Ahmedabad", 950, 14, ["Jaipur", "Udaipur", "Jodhpur"]],
  ["Ahmedabad", "Delhi", 950, 14, ["Jodhpur", "Udaipur", "Jaipur"]],
  ["Delhi", "Pune", 1450, 21, ["Jaipur", "Ahmedabad", "Mumbai"]],
  ["Pune", "Delhi", 1450, 21, ["Mumbai", "Ahmedabad", "Jaipur"]],
  ["Delhi", "Jaipur", 270, 5, ["Gurugram", "Alwar"]],
  ["Jaipur", "Delhi", 270, 5, ["Alwar", "Gurugram"]],
  ["Delhi", "Chandigarh", 240, 4.5, ["Chandigarh"]],
  ["Chandigarh", "Delhi", 240, 4.5, ["Chandigarh"]],
  ["Delhi", "Lucknow", 550, 8, ["Kanpur", "Agra"]],
  ["Lucknow", "Delhi", 550, 8, ["Kanpur", "Agra"]],
  ["Delhi", "Dehradun", 250, 6, ["Meerut", "Dehradun"]],
  ["Dehradun", "Delhi", 250, 6, ["Meerut", "Dehradun"]],
  ["Delhi", "Amritsar", 450, 7, ["Chandigarh", "Amritsar"]],
  ["Amritsar", "Delhi", 450, 7, ["Chandigarh", "Amritsar"]],
  ["Delhi", "Jammu", 580, 9, ["Chandigarh", "Jammu"]],
  ["Jammu", "Delhi", 580, 9, ["Chandigarh", "Jammu"]],
  ["Delhi", "Srinagar", 850, 14, ["Jammu", "Srinagar"]],
  ["Srinagar", "Delhi", 850, 14, ["Jammu", "Srinagar"]],
  ["Delhi", "Varanasi", 820, 12, ["Kanpur", "Prayagraj", "Varanasi"]],
  ["Varanasi", "Delhi", 820, 12, ["Prayagraj", "Kanpur", "Delhi"]],
  ["Delhi", "Patna", 1100, 16, ["Kanpur", "Prayagraj", "Varanasi", "Patna"]],
  ["Patna", "Delhi", 1100, 16, ["Varanasi", "Prayagraj", "Kanpur", "Delhi"]],
  ["Delhi", "Indore", 800, 12, ["Jaipur", "Bhopal", "Indore"]],
  ["Indore", "Delhi", 800, 12, ["Bhopal", "Jaipur", "Delhi"]],
  ["Delhi", "Bhopal", 780, 11, ["Gwalior", "Jabalpur", "Bhopal"]],
  ["Bhopal", "Delhi", 780, 11, ["Jabalpur", "Gwalior", "Delhi"]],
  ["Delhi", "Nagpur", 1050, 15, ["Gwalior", "Jabalpur", "Nagpur"]],
  ["Nagpur", "Delhi", 1050, 15, ["Jabalpur", "Gwalior", "Delhi"]],
  ["Delhi", "Agra", 200, 4, ["Agra"]],
  ["Agra", "Delhi", 200, 4, ["Agra"]],
  ["Delhi", "Meerut", 70, 1.5, ["Meerut"]],
  ["Meerut", "Delhi", 70, 1.5, ["Meerut"]],

  // ---- MUMBAI CORRIDORS ----
  ["Mumbai", "Bangalore", 980, 14, ["Pune", "Belgaum", "Hubli"]],
  ["Bangalore", "Mumbai", 980, 14, ["Hubli", "Belgaum", "Pune"]],
  ["Mumbai", "Chennai", 1330, 19, ["Pune", "Solapur", "Hyderabad"]],
  ["Chennai", "Mumbai", 1330, 19, ["Hyderabad", "Solapur", "Pune"]],
  ["Mumbai", "Pune", 150, 3, ["Pune"]],
  ["Pune", "Mumbai", 150, 3, ["Pune"]],
  ["Mumbai", "Ahmedabad", 530, 8, ["Surat", "Vadodara", "Ahmedabad"]],
  ["Ahmedabad", "Mumbai", 530, 8, ["Vadodara", "Surat", "Mumbai"]],
  ["Mumbai", "Goa (Panaji)", 580, 10, ["Kolhapur", "Goa (Panaji)"]],
  ["Goa (Panaji)", "Mumbai", 580, 10, ["Kolhapur", "Mumbai"]],
  ["Mumbai", "Hyderabad", 780, 11, ["Aurangabad", "Nashik"]],
  ["Hyderabad", "Mumbai", 780, 11, ["Nashik", "Aurangabad"]],
  ["Mumbai", "Indore", 650, 10, ["Nashik", "Bhopal", "Indore"]],
  ["Indore", "Mumbai", 650, 10, ["Bhopal", "Nashik", "Mumbai"]],
  ["Mumbai", "Bhopal", 770, 11, ["Nashik", "Bhopal"]],
  ["Bhopal", "Mumbai", 770, 11, ["Nashik", "Mumbai"]],
  ["Mumbai", "Nagpur", 820, 12, ["Aurangabad", "Nagpur"]],
  ["Nagpur", "Mumbai", 820, 12, ["Aurangabad", "Mumbai"]],
  ["Mumbai", "Jaipur", 1150, 16, ["Ahmedabad", "Jodhpur", "Jaipur"]],
  ["Jaipur", "Mumbai", 1150, 16, ["Jodhpur", "Ahmedabad", "Mumbai"]],
  ["Mumbai", "Kolkata", 2050, 30, ["Nagpur", "Raipur", "Bhubaneswar", "Kolkata"]],
  ["Kolkata", "Mumbai", 2050, 30, ["Bhubaneswar", "Raipur", "Nagpur", "Mumbai"]],

  // ---- BANGALORE CORRIDORS ----
  ["Bangalore", "Chennai", 350, 6, ["Vellore", "Chennai"]],
  ["Chennai", "Bangalore", 350, 6, ["Vellore", "Chennai"]],
  ["Bangalore", "Hyderabad", 570, 9, ["Anantapur", "Hyderabad"]],
  ["Hyderabad", "Bangalore", 570, 9, ["Anantapur", "Bangalore"]],
  ["Bangalore", "Goa (Panaji)", 560, 9, ["Hubli", "Belgaum", "Goa (Panaji)"]],
  ["Goa (Panaji)", "Bangalore", 560, 9, ["Belgaum", "Hubli", "Bangalore"]],
  ["Bangalore", "Kochi", 550, 9, ["Coimbatore", "Kochi"]],
  ["Kochi", "Bangalore", 550, 9, ["Coimbatore", "Bangalore"]],
  ["Bangalore", "Mysore", 150, 3, ["Mysore"]],
  ["Mysore", "Bangalore", 150, 3, ["Mysore"]],
  ["Bangalore", "Coimbatore", 365, 6, ["Salem", "Coimbatore"]],
  ["Coimbatore", "Bangalore", 365, 6, ["Salem", "Bangalore"]],
  ["Bangalore", "Mangalore", 350, 7, ["Hubli", "Mangalore"]],
  ["Mangalore", "Bangalore", 350, 7, ["Hubli", "Bangalore"]],
  ["Bangalore", "Pune", 840, 13, ["Hubli", "Belgaum", "Pune"]],
  ["Pune", "Bangalore", 840, 13, ["Belgaum", "Hubli", "Bangalore"]],
  ["Bangalore", "Ahmedabad", 1500, 22, ["Pune", "Mumbai", "Ahmedabad"]],
  ["Ahmedabad", "Bangalore", 1500, 22, ["Mumbai", "Pune", "Bangalore"]],
  ["Bangalore", "Madurai", 460, 8, ["Salem", "Madurai"]],
  ["Madurai", "Bangalore", 460, 8, ["Salem", "Bangalore"]],

  // ---- CHENNAI CORRIDORS ----
  ["Chennai", "Hyderabad", 800, 12, ["Vijayawada", "Hyderabad"]],
  ["Hyderabad", "Chennai", 800, 12, ["Vijayawada", "Chennai"]],
  ["Chennai", "Kochi", 700, 11, ["Coimbatore", "Kochi"]],
  ["Kochi", "Chennai", 700, 11, ["Coimbatore", "Chennai"]],
  ["Chennai", "Tiruchirappalli", 330, 6, ["Tiruchirappalli"]],
  ["Tiruchirappalli", "Chennai", 330, 6, ["Tiruchirappalli"]],
  ["Chennai", "Madurai", 460, 7.5, ["Tiruchirappalli", "Madurai"]],
  ["Madurai", "Chennai", 460, 7.5, ["Tiruchirappalli", "Chennai"]],
  ["Chennai", "Visakhapatnam", 800, 12, ["Vijayawada", "Visakhapatnam"]],
  ["Visakhapatnam", "Chennai", 800, 12, ["Vijayawada", "Chennai"]],
  ["Chennai", "Coimbatore", 510, 8, ["Salem", "Erode", "Coimbatore"]],
  ["Coimbatore", "Chennai", 510, 8, ["Erode", "Salem", "Chennai"]],
  ["Chennai", "Salem", 340, 6, ["Salem"]],
  ["Salem", "Chennai", 340, 6, ["Chennai"]],
  ["Chennai", "Bangalore", 350, 6, ["Bangalore"]],
  ["Chennai", "Thiruvananthapuram", 900, 14, ["Coimbatore", "Kochi", "Thiruvananthapuram"]],
  ["Thiruvananthapuram", "Chennai", 900, 14, ["Kochi", "Coimbatore", "Chennai"]],

  // ---- KOLKATA CORRIDORS ----
  ["Kolkata", "Bhubaneswar", 470, 7, ["Bhubaneswar"]],
  ["Bhubaneswar", "Kolkata", 470, 7, ["Kolkata"]],
  ["Kolkata", "Patna", 590, 9, ["Dhanbad", "Patna"]],
  ["Patna", "Kolkata", 590, 9, ["Dhanbad", "Kolkata"]],
  ["Kolkata", "Guwahati", 980, 16, ["Siliguri", "Guwahati"]],
  ["Guwahati", "Kolkata", 980, 16, ["Siliguri", "Kolkata"]],
  ["Kolkata", "Ranchi", 350, 6, ["Durgapur", "Ranchi"]],
  ["Ranchi", "Kolkata", 350, 6, ["Durgapur", "Kolkata"]],
  ["Kolkata", "Siliguri", 570, 9, ["Siliguri"]],
  ["Siliguri", "Kolkata", 570, 9, ["Kolkata"]],
  ["Kolkata", "Visakhapatnam", 880, 13, ["Bhubaneswar", "Visakhapatnam"]],
  ["Visakhapatnam", "Kolkata", 880, 13, ["Bhubaneswar", "Kolkata"]],
  ["Kolkata", "Jamshedpur", 300, 5.5, ["Dhanbad", "Jamshedpur"]],
  ["Jamshedpur", "Kolkata", 300, 5.5, ["Dhanbad", "Kolkata"]],

  // ---- HYDERABAD CORRIDORS ----
  ["Hyderabad", "Vijayawada", 275, 5, ["Guntur", "Vijayawada"]],
  ["Vijayawada", "Hyderabad", 275, 5, ["Guntur", "Hyderabad"]],
  ["Hyderabad", "Visakhapatnam", 630, 10, ["Vijayawada", "Visakhapatnam"]],
  ["Visakhapatnam", "Hyderabad", 630, 10, ["Vijayawada", "Hyderabad"]],
  ["Hyderabad", "Nagpur", 500, 8, ["Nagpur"]],
  ["Nagpur", "Hyderabad", 500, 8, ["Hyderabad"]],
  ["Hyderabad", "Pune", 560, 9, ["Solapur", "Pune"]],
  ["Pune", "Hyderabad", 560, 9, ["Solapur", "Hyderabad"]],
  ["Hyderabad", "Ahmedabad", 930, 14, ["Nagpur", "Bhopal", "Indore", "Ahmedabad"]],
  ["Ahmedabad", "Hyderabad", 930, 14, ["Indore", "Bhopal", "Nagpur", "Hyderabad"]],
  ["Hyderabad", "Raipur", 540, 8.5, ["Nagpur", "Raipur"]],
  ["Raipur", "Hyderabad", 540, 8.5, ["Nagpur", "Hyderabad"]],

  // ---- AHMEDABAD CORRIDORS ----
  ["Ahmedabad", "Jaipur", 670, 10, ["Udaipur", "Jaipur"]],
  ["Jaipur", "Ahmedabad", 670, 10, ["Udaipur", "Ahmedabad"]],
  ["Ahmedabad", "Pune", 660, 10, ["Mumbai", "Pune"]],
  ["Pune", "Ahmedabad", 660, 10, ["Mumbai", "Ahmedabad"]],
  ["Ahmedabad", "Indore", 400, 7, ["Indore"]],
  ["Indore", "Ahmedabad", 400, 7, ["Ahmedabad"]],
  ["Ahmedabad", "Udaipur", 262, 5, ["Udaipur"]],
  ["Udaipur", "Ahmedabad", 262, 5, ["Ahmedabad"]],

  // ---- PUNE CORRIDORS ----
  ["Pune", "Nashik", 210, 4, ["Nashik"]],
  ["Nashik", "Pune", 210, 4, ["Pune"]],
  ["Pune", "Aurangabad", 240, 4.5, ["Aurangabad"]],
  ["Aurangabad", "Pune", 240, 4.5, ["Pune"]],
  ["Pune", "Kolhapur", 240, 4.5, ["Kolhapur"]],
  ["Kolhapur", "Pune", 240, 4.5, ["Pune"]],
  ["Pune", "Solapur", 210, 4, ["Solapur"]],
  ["Solapur", "Pune", 210, 4, ["Pune"]],

  // ---- JAIPUR CORRIDORS ----
  ["Jaipur", "Jodhpur", 337, 5.5, ["Jodhpur"]],
  ["Jodhpur", "Jaipur", 337, 5.5, ["Jaipur"]],
  ["Jaipur", "Udaipur", 393, 6, ["Udaipur"]],
  ["Udaipur", "Jaipur", 393, 6, ["Jaipur"]],
  ["Jaipur", "Kota", 240, 4, ["Kota"]],
  ["Kota", "Jaipur", 240, 4, ["Jaipur"]],
  ["Jaipur", "Agra", 240, 4.5, ["Agra"]],
  ["Agra", "Jaipur", 240, 4.5, ["Jaipur"]],

  // ---- LUCKNOW CORRIDORS ----
  ["Lucknow", "Varanasi", 320, 5.5, ["Prayagraj", "Varanasi"]],
  ["Varanasi", "Lucknow", 320, 5.5, ["Prayagraj", "Lucknow"]],
  ["Lucknow", "Kanpur", 80, 1.5, ["Kanpur"]],
  ["Kanpur", "Lucknow", 80, 1.5, ["Lucknow"]],
  ["Lucknow", "Patna", 540, 8, ["Kanpur", "Prayagraj", "Patna"]],
  ["Patna", "Lucknow", 540, 8, ["Prayagraj", "Kanpur", "Lucknow"]],
  ["Lucknow", "Dehradun", 600, 10, ["Meerut", "Dehradun"]],
  ["Dehradun", "Lucknow", 600, 10, ["Meerut", "Lucknow"]],

  // ---- GOA CORRIDORS ----
  ["Goa (Panaji)", "Kolhapur", 220, 4.5, ["Kolhapur"]],
  ["Kolhapur", "Goa (Panaji)", 220, 4.5, ["Goa (Panaji)"]],
  ["Goa (Panaji)", "Hubli", 190, 4, ["Hubli"]],
  ["Hubli", "Goa (Panaji)", 190, 4, ["Goa (Panaji)"]],
  ["Goa (Panaji)", "Belgaum", 125, 2.5, ["Belgaum"]],
  ["Belgaum", "Goa (Panaji)", 125, 2.5, ["Goa (Panaji)"]],

  // ---- KOCHI / KERALA CORRIDORS ----
  ["Kochi", "Thiruvananthapuram", 200, 4, ["Thiruvananthapuram"]],
  ["Thiruvananthapuram", "Kochi", 200, 4, ["Kochi"]],
  ["Kochi", "Coimbatore", 195, 4, ["Coimbatore"]],
  ["Coimbatore", "Kochi", 195, 4, ["Kochi"]],
  ["Kochi", "Madurai", 250, 5, ["Madurai"]],
  ["Madurai", "Kochi", 250, 5, ["Kochi"]],

  // ---- GUWAHATI / NE CORRIDORS ----
  ["Guwahati", "Siliguri", 520, 8.5, ["Siliguri"]],
  ["Siliguri", "Guwahati", 520, 8.5, ["Guwahati"]],
  ["Guwahati", "Shillong", 100, 3, ["Shillong"]],
  ["Shillong", "Guwahati", 100, 3, ["Guwahati"]],

  // ---- VISAKHAPATNAM CORRIDORS ----
  ["Visakhapatnam", "Vijayawada", 350, 6, ["Vijayawada"]],
  ["Vijayawada", "Visakhapatnam", 350, 6, ["Visakhapatnam"]],

  // ---- TIER-2 INTERCITY ----
  ["Nagpur", "Raipur", 290, 5, ["Raipur"]],
  ["Raipur", "Nagpur", 290, 5, ["Nagpur"]],
  ["Indore", "Bhopal", 195, 3.5, ["Bhopal"]],
  ["Bhopal", "Indore", 195, 3.5, ["Indore"]],
  ["Bhopal", "Nagpur", 360, 6, ["Jabalpur", "Nagpur"]],
  ["Nagpur", "Bhopal", 360, 6, ["Jabalpur", "Bhopal"]],
  ["Nagpur", "Raipur", 290, 5, ["Raipur"]],
  ["Coimbatore", "Salem", 165, 3, ["Salem"]],
  ["Salem", "Coimbatore", 165, 3, ["Coimbatore"]],
  ["Madurai", "Tiruchirappalli", 220, 4, ["Tiruchirappalli"]],
  ["Tiruchirappalli", "Madurai", 220, 4, ["Madurai"]],
  ["Salem", "Erode", 55, 1, ["Erode"]],
  ["Erode", "Salem", 55, 1, ["Salem"]],
  ["Mangalore", "Hubli", 340, 6, ["Hubli"]],
  ["Hubli", "Mangalore", 340, 6, ["Mangalore"]],
  ["Belgaum", "Hubli", 95, 2, ["Hubli"]],
  ["Hubli", "Belgaum", 95, 2, ["Belgaum"]],
  ["Nashik", "Aurangabad", 190, 3.5, ["Aurangabad"]],
  ["Aurangabad", "Nashik", 190, 3.5, ["Nashik"]],
  ["Surat", "Vadodara", 150, 3, ["Vadodara"]],
  ["Vadodara", "Surat", 150, 3, ["Surat"]],
  ["Ahmedabad", "Rajkot", 216, 4, ["Rajkot"]],
  ["Rajkot", "Ahmedabad", 216, 4, ["Ahmedabad"]],
  ["Kolhapur", "Belgaum", 215, 4, ["Belgaum"]],
  ["Belgaum", "Kolhapur", 215, 4, ["Kolhapur"]],
  ["Jabalpur", "Raipur", 270, 5, ["Raipur"]],
  ["Raipur", "Jabalpur", 270, 5, ["Jabalpur"]],
  ["Gwalior", "Jabalpur", 335, 5.5, ["Jabalpur"]],
  ["Jabalpur", "Gwalior", 335, 5.5, ["Gwalior"]],
  ["Gwalior", "Jaipur", 210, 4, ["Jaipur"]],
  ["Jaipur", "Gwalior", 210, 4, ["Gwalior"]],
  ["Kota", "Indore", 270, 5, ["Indore"]],
  ["Indore", "Kota", 270, 5, ["Kota"]],
  ["Udaipur", "Jodhpur", 250, 4.5, ["Jodhpur"]],
  ["Jodhpur", "Udaipur", 250, 4.5, ["Udaipur"]],
  ["Agra", "Kanpur", 280, 5, ["Kanpur"]],
  ["Kanpur", "Agra", 280, 5, ["Agra"]],
  ["Prayagraj", "Varanasi", 120, 2.5, ["Varanasi"]],
  ["Varanasi", "Prayagraj", 120, 2.5, ["Prayagraj"]],
  ["Patna", "Ranchi", 330, 6, ["Ranchi"]],
  ["Ranchi", "Patna", 330, 6, ["Patna"]],
  ["Patna", "Varanasi", 310, 5.5, ["Varanasi"]],
  ["Varanasi", "Patna", 310, 5.5, ["Patna"]],
  ["Dhanbad", "Ranchi", 170, 3, ["Ranchi"]],
  ["Ranchi", "Dhanbad", 170, 3, ["Dhanbad"]],
  ["Jamshedpur", "Ranchi", 130, 2.5, ["Ranchi"]],
  ["Ranchi", "Jamshedpur", 130, 2.5, ["Jamshedpur"]],
  ["Durgapur", "Kolkata", 160, 3, ["Kolkata"]],
  ["Kolkata", "Durgapur", 160, 3, ["Durgapur"]],
  ["Asansol", "Durgapur", 30, 0.7, ["Durgapur"]],
  ["Durgapur", "Asansol", 30, 0.7, ["Asansol"]],
  ["Mysore", "Coimbatore", 210, 4, ["Coimbatore"]],
  ["Coimbatore", "Mysore", 210, 4, ["Mysore"]],
  ["Mangalore", "Kochi", 410, 7, ["Kochi"]],
  ["Kochi", "Mangalore", 410, 7, ["Mangalore"]],
  ["Hubli", "Belgaum", 95, 2, ["Belgaum"]],
  ["Belgaum", "Hubli", 95, 2, ["Hubli"]],
  ["Solapur", "Belgaum", 280, 5, ["Belgaum"]],
  ["Belgaum", "Solapur", 280, 5, ["Solapur"]],
  ["Vijayawada", "Guntur", 33, 0.5, ["Guntur"]],
  ["Guntur", "Vijayawada", 33, 0.5, ["Vijayawada"]],
  ["Vijayawada", "Nellore", 285, 5, ["Nellore"]],
  ["Nellore", "Vijayawada", 285, 5, ["Vijayawada"]],
  ["Nashik", "Mumbai", 170, 3.5, ["Mumbai"]],
  ["Mumbai", "Nashik", 170, 3.5, ["Nashik"]],
  ["Pune", "Kolhapur", 240, 4.5, ["Kolhapur"]],
  ["Kolhapur", "Pune", 240, 4.5, ["Pune"]],
  ["Nagpur", "Aurangabad", 485, 8, ["Aurangabad"]],
  ["Aurangabad", "Nagpur", 485, 8, ["Nagpur"]],
  ["Mysore", "Mangalore", 330, 6.5, ["Mangalore"]],
  ["Mangalore", "Mysore", 330, 6.5, ["Mysore"]],
  ["Madurai", "Salem", 140, 3, ["Salem"]],
  ["Salem", "Madurai", 140, 3, ["Madurai"]],
  ["Tiruchirappalli", "Salem", 135, 2.5, ["Salem"]],
  ["Salem", "Tiruchirappalli", 135, 2.5, ["Tiruchirappalli"]],
  ["Erode", "Coimbatore", 100, 2, ["Coimbatore"]],
  ["Coimbatore", "Erode", 100, 2, ["Erode"]],
  ["Thiruvananthapuram", "Madurai", 300, 5.5, ["Madurai"]],
  ["Madurai", "Thiruvananthapuram", 300, 5.5, ["Thiruvananthapuram"]],
  ["Bhubaneswar", "Visakhapatnam", 444, 7, ["Visakhapatnam"]],
  ["Visakhapatnam", "Bhubaneswar", 444, 7, ["Bhubaneswar"]],
  ["Bhubaneswar", "Ranchi", 470, 8, ["Ranchi"]],
  ["Ranchi", "Bhubaneswar", 470, 8, ["Bhubaneswar"]],
  ["Siliguri", "Patna", 590, 9.5, ["Patna"]],
  ["Patna", "Siliguri", 590, 9.5, ["Siliguri"]],
  ["Guwahati", "Dibrugarh", 440, 8, ["Dibrugarh"]],
  ["Dibrugarh", "Guwahati", 440, 8, ["Guwahati"]],
  ["Gwalior", "Agra", 120, 2.5, ["Agra"]],
  ["Agra", "Gwalior", 120, 2.5, ["Gwalior"]],
  ["Raipur", "Bhopal", 530, 8.5, ["Jabalpur", "Bhopal"]],
  ["Bhopal", "Raipur", 530, 8.5, ["Jabalpur", "Raipur"]],
  ["Indore", "Nagpur", 640, 10, ["Bhopal", "Jabalpur", "Nagpur"]],
  ["Nagpur", "Indore", 640, 10, ["Jabalpur", "Bhopal", "Indore"]],
  ["Jodhpur", "Ahmedabad", 450, 7, ["Ahmedabad"]],
  ["Ahmedabad", "Jodhpur", 450, 7, ["Jodhpur"]],
  ["Rajkot", "Jamnagar", 90, 2, ["Jamnagar"]],
  ["Jamnagar", "Rajkot", 90, 2, ["Rajkot"]],
  ["Mangalore", "Belgaum", 310, 5.5, ["Belgaum"]],
  ["Belgaum", "Mangalore", 310, 5.5, ["Mangalore"]],
  ["Hyderabad", "Vizag", 630, 10, ["Vijayawada", "Visakhapatnam"]],
  ["Vizag", "Hyderabad", 630, 10, ["Vijayawada", "Hyderabad"]],
];

// ---------------------------------------------------------------------------
// 4. HELPERS
// ---------------------------------------------------------------------------
const SEED = 42;
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const rand = seededRandom(SEED);

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function pickN(arr, n) {
  const shuffled = arr.slice().sort(() => rand() - 0.5);
  return shuffled.slice(0, n);
}

function generateTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.floor(totalMinutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function interpolateLat(l1, lng1, l2, lng2, fraction) {
  return +(l1 + (l2 - l1) * fraction).toFixed(4);
}

function interpolateLng(l1, lng1, l2, lng2, fraction) {
  return +(lng1 + (lng2 - lng1) * fraction).toFixed(4);
}

function makeFareConfig(distKm) {
  const baseFare = Math.round(50 + distKm * 0.8);
  const pricePerKm = +(1.5 + rand() * 1.5).toFixed(2);
  const minimumFare = Math.round(100 + rand() * 50);
  return {
    baseFare,
    pricePerKm,
    minimumFare,
    taxPercent: 5,
    serviceFee: 12,
    busTypeMultipliers: new Map([
      ["standard", 1.0],
      ["sleeper", 1.8],
      ["A/C Seater", 1.5],
      ["A/C Sleeper", 2.0],
      ["Non-A/C", 0.9],
      ["volvo", 2.2],
      ["semi-sleeper", 1.3],
      ["luxury-sleeper", 1.9],
      ["multi-axle-ac", 2.1],
    ]),
    seatTypePremiums: new Map([
      ["regular", 0],
      ["window", 30],
      ["aisle", 20],
      ["lower-berth", 50],
      ["upper-berth", 30],
      ["sleeper", 100],
    ]),
    dynamicPricing: {
      enabled: true,
      thresholds: { lowOccupancy: 50, midOccupancy: 75, highOccupancy: 90 },
      surcharges: { low: 0, mid: 5, high: 10, peak: 15 },
      weekendMultiplier: 1.05,
      holidayMultiplier: 1.10,
    },
  };
}

function generateStops(fromCity, toCity, distKm, hours, intermediateKeys) {
  const fromCoord = CITIES[fromCity];
  const toCoord = CITIES[toCity];
  if (!fromCoord || !toCoord) return [];

  const stops = [];
  const allPoints = [fromCity, ...intermediateKeys, toCity];
  const segments = allPoints.length - 1;
  const distPerSegment = distKm / segments;
  const minsPerSegment = Math.round((hours * 60) / segments);

  // Generate some realistic Indian boarding/dropping point names
  const boardingSets = [
    ["Bus Stand", "RSRTC Stand", "Private Bus Stand", "Near Railway Station"],
    ["City Center", "Main Bus Terminal", "Highway Pickup Point", "Bypass Junction"],
    ["Mall Pickup", "IT Park Gate", "College Road Stop", "Ring Road Junction"],
    ["Kathra", "ISBT", "Inter-State Bus Terminal", "Transport Nagar"],
  ];

  const droppingSets = [
    ["Bus Stand", "City Bus Stop", "Near Railway Station", "Main Gate"],
    ["Highway Drop Point", "Flyover Junction", "By-Pass Road", "Transport Nagar"],
    ["City Center", "Municipal Corporation", "Old Bus Stand", "Ring Road"],
  ];

  for (let i = 0; i < allPoints.length; i++) {
    const city = allPoints[i];
    const coord = CITIES[city];
    if (!coord) continue;

    const fraction = i / segments;
    const cumDist = Math.round(distPerSegment * i);
    const cumMins = Math.round(minsPerSegment * i);

    // Jitter lat/lng slightly if not origin or destination
    let lat = coord.lat;
    let lng = coord.lng;
    if (i > 0 && i < segments) {
      lat = interpolateLat(fromCoord.lat, fromCoord.lng, toCoord.lat, toCoord.lng, fraction + (rand() - 0.5) * 0.05);
      lng = interpolateLng(fromCoord.lat, fromCoord.lng, toCoord.lat, toCoord.lng, fraction + (rand() - 0.5) * 0.05);
    }

    const arrivalMin = cumMins + randInt(-5, 10);
    const departureMin = cumMins + randInt(5, 15);

    const boardingPoints = [];
    const droppingPoints = [];
    if (i === 0) {
      boardingPoints.push(
        `${city} ${pick(boardingSets[0])}`,
        `${city} ${pick(boardingSets[1])}`
      );
    } else {
      boardingPoints.push(`${city} ${pick(boardingSets[2])}`);
    }
    if (i === segments) {
      droppingPoints.push(
        `${city} ${pick(droppingSets[0])}`,
        `${city} ${pick(droppingSets[1])}`
      );
    } else if (i > 0) {
      droppingPoints.push(`${city} ${pick(droppingSets[2])}`);
    }

    stops.push({
      stopName: city,
      stopId: `STOP-${fromCity.substring(0, 3).toUpperCase()}-${toCity.substring(0, 3).toUpperCase()}-${String(i).padStart(2, "0")}`,
      sequence: i + 1,
      arrivalTime: generateTime(Math.max(0, arrivalMin)),
      departureTime: generateTime(departureMin),
      distanceFromOrigin: cumDist,
      latitude: lat,
      longitude: lng,
      boardingPoints,
      droppingPoints,
    });
  }

  return stops;
}

// ---------------------------------------------------------------------------
// 5. BUS TYPE CONFIGURATIONS
// ---------------------------------------------------------------------------
const BUS_TYPES = [
  { type: "standard",    seats: [38, 40, 42, 44], seatRows: [9, 10, 11], seatsPerRow: 4 },
  { type: "sleeper",     seats: [30, 33, 36],      seatRows: [10, 11, 12], seatsPerRow: 3 },
  { type: "A/C Seater",  seats: [40, 42, 44, 45],  seatRows: [10, 11], seatsPerRow: 4 },
  { type: "A/C Sleeper", seats: [28, 30, 32],      seatRows: [10, 11], seatsPerRow: 3 },
  { type: "Non-A/C",     seats: [40, 42, 44],      seatRows: [10, 11], seatsPerRow: 4 },
  { type: "volvo",       seats: [40, 42, 44, 45],  seatRows: [10, 11], seatsPerRow: 4 },
  { type: "semi-sleeper",seats: [34, 36, 38],      seatRows: [10, 11], seatsPerRow: 3 },
  { type: "luxury-sleeper", seats: [24, 26, 28],   seatRows: [8, 9, 10], seatsPerRow: 3 },
  { type: "multi-axle-ac", seats: [42, 44, 45],    seatRows: [10, 11], seatsPerRow: 4 },
];

const AMENITIES_POOL = [
  "Water Bottle", "Blanket", "Pillow", "Charging Point", "Reading Light",
  "Curtain", "GPS Tracking", "WiFi", "TV", "Snacks",
  "Emergency Contact", "Live Tracking", "CCTV", "Fire Extinguisher",
  "First Aid Kit", "Reclining Seats", "Leg Rest", "Arm Rest",
  "USB Charging", "Individual Reading Light",
];

function generateRating() {
  const count = randInt(3, 8);
  const ratings = [];
  for (let i = 0; i < count; i++) {
    ratings.push(+(3 + rand() * 2).toFixed(1));
  }
  return ratings;
}

function generateOperatingDays() {
  const mode = randInt(1, 4);
  if (mode <= 2) return [0, 1, 2, 3, 4, 5, 6]; // daily
  if (mode === 3) {
    const start = randInt(0, 5);
    const days = [];
    for (let i = 0; i < 5; i++) days.push((start + i) % 7);
    return days.sort();
  }
  return [0, 1, 2, 3, 4, 5, 6]; // default daily
}

function fareForBusType(routeFareConfig, busType, distKm) {
  const mult = routeFareConfig.busTypeMultipliers.get(busType) || 1.0;
  const raw = routeFareConfig.baseFare + distKm * routeFareConfig.pricePerKm * mult;
  return Math.round(Math.max(raw, routeFareConfig.minimumFare));
}

// ---------------------------------------------------------------------------
// 6. MAIN SEED FUNCTION
// ---------------------------------------------------------------------------
async function seed() {
  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://localhost:27017/tedbus";
  console.log(`Connecting to ${MONGODB_URI} ...`);

  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.\n");

  // Drop existing collections
  console.log("Dropping existing Routes and Buses collections...");
  await Route.collection.drop().catch(() => {});
  await Bus.collection.drop().catch(() => {});
  console.log("Collections dropped.\n");

  // ---- Build routes ----
  const routeDocs = [];
  const routeMap = {}; // "CityA|CityB" => mongoose document

  console.log(`Building ${ROUTE_DEFS.length} route documents...`);

  for (const [fromCity, toCity, distKm, hours, intermediateKeys] of ROUTE_DEFS) {
    const stops = generateStops(fromCity, toCity, distKm, hours, intermediateKeys);
    const fareConfig = makeFareConfig(distKm);

    const routeDoc = {
      departureLocation: {
        name: fromCity,
        subLocations: [`${fromCity} Bus Stand`, `${fromCity} ISBT`],
      },
      arrivalLocation: {
        name: toCity,
        subLocations: [`${toCity} Bus Stand`, `${toCity} ISBT`],
      },
      duration: hours,
      stops,
      totalDistanceKm: distKm,
      fareConfig,
      routeName: `${fromCity} → ${toCity}`,
      isActive: true,
    };

    routeDocs.push(routeDoc);
  }

  console.log("Inserting routes...");
  const insertedRoutes = await Route.insertMany(routeDocs);
  console.log(`Inserted ${insertedRoutes.length} routes.`);

  // Build a map for fast lookup
  for (const r of insertedRoutes) {
    const key = `${r.departureLocation.name}|${r.arrivalLocation.name}`;
    routeMap[key] = r;
  }

  // ---- Build buses ----
  console.log("\nBuilding bus documents...");
  const busDocs = [];

  for (const route of insertedRoutes) {
    const fromCity = route.departureLocation.name;
    const toCity = route.arrivalLocation.name;
    const distKm = route.totalDistanceKm;
    const fareConfig = route.fareConfig;

    // Determine number of buses per route:
    // All routes get minimum 10 buses. Major routes (1000+ km) get 15-25, medium get 12-18, short get 10-14
    let busCount;
    if (distKm >= 1000) busCount = randInt(15, 25);
    else if (distKm >= 400) busCount = randInt(12, 18);
    else busCount = randInt(10, 14);

    // Select operators for this route
    const routeOperators = pickN(OPERATORS, Math.min(busCount, OPERATORS.length));

    for (let b = 0; b < busCount; b++) {
      const operator = routeOperators[b % routeOperators.length];
      const bt = pick(BUS_TYPES);

      // Departure time: spread across the day
      const startMin = randInt(0, 23 * 60);
      const departureTime = generateTime(startMin);

      // Fare based on distance and bus type
      const fare = fareForBusType(fareConfig, bt.type, distKm);

      // Seat layout
      const totalSeats = pick(bt.seats);
      const seatsPerRow = bt.seatsPerRow;
      const totalRows = Math.ceil(totalSeats / seatsPerRow);

      // Image placeholder
      const images = `https://dummyimage.com/600x400/000/fff&text=${encodeURIComponent(operator + " " + bt.type)}`;

      // Live tracking & reschedulable: 1=yes, 0=no
      const liveTracking = rand() > 0.2 ? 1 : 0;
      const reschedulable = rand() > 0.5 ? 1 : 0;

      // Rating
      const rating = generateRating();

      // Operating days
      const operatingDays = generateOperatingDays();

      // Amenities
      const amenityCount = bt.type.includes("luxury") || bt.type.includes("volvo") || bt.type.includes("sleeper")
        ? randInt(6, 12)
        : randInt(3, 7);
      const amenities = pickN(AMENITIES_POOL, amenityCount);

      const busDoc = {
        operatorName: operator.trim(),
        busType: bt.type,
        departureTime,
        rating,
        totalSeats,
        routes: route._id,
        images,
        liveTracking,
        reschedulable,
        operatingDays,
        fareOverrides: {
          busTypeMultiplier: null,
          seatTypePrices: null,
        },
        seatLayout: {
          seatsPerRow,
          totalRows,
          seatTypes: null,
        },
      };

      busDocs.push(busDoc);
    }
  }

  console.log(`Total buses to insert: ${busDocs.length}`);

  // Insert buses in batches of 500 to avoid memory issues
  const BATCH_SIZE = 500;
  let insertedCount = 0;
  for (let i = 0; i < busDocs.length; i += BATCH_SIZE) {
    const batch = busDocs.slice(i, i + BATCH_SIZE);
    await Bus.insertMany(batch);
    insertedCount += batch.length;
    process.stdout.write(`  Inserted ${insertedCount}/${busDocs.length} buses\r`);
  }
  console.log(`\nInserted ${insertedCount} buses.`);

  // ---- Summary Stats ----
  console.log("\n========================================");
  console.log("           SEED SUMMARY");
  console.log("========================================");
  console.log(`Cities defined:          ${Object.keys(CITIES).length}`);
  console.log(`Route corridors:         ${ROUTE_DEFS.length}`);
  console.log(`Routes inserted:         ${insertedRoutes.length}`);
  console.log(`Buses inserted:          ${insertedCount}`);

  // Per-route stats
  const routeStats = {};
  for (const bus of busDocs) {
    const rid = bus.routes.toString();
    if (!routeStats[rid]) routeStats[rid] = { count: 0, operators: new Set() };
    routeStats[rid].count++;
    routeStats[rid].operators.add(bus.operatorName);
  }

  const topRoutes = Object.values(routeStats)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  console.log("\nTop 10 routes by bus count:");
  for (const rs of topRoutes) {
    console.log(`  ${rs.count} buses, ${rs.operators.size} operators`);
  }

  // Bus type distribution
  const typeDist = {};
  for (const bus of busDocs) {
    typeDist[bus.busType] = (typeDist[bus.busType] || 0) + 1;
  }
  console.log("\nBus type distribution:");
  for (const [t, c] of Object.entries(typeDist).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t}: ${c}`);
  }

  // Operator distribution (top 10)
  const opDist = {};
  for (const bus of busDocs) {
    opDist[bus.operatorName] = (opDist[bus.operatorName] || 0) + 1;
  }
  console.log("\nTop 10 operators:");
  for (const [op, c] of Object.entries(opDist).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`  ${op}: ${c} buses`);
  }

  // Unique operators
  console.log(`\nTotal unique operators:  ${Object.keys(opDist).length}`);

  console.log("========================================");
  console.log("Seed completed successfully!");
  console.log("========================================\n");

  await mongoose.disconnect();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 7. RUN
// ---------------------------------------------------------------------------
seed().catch((err) => {
  console.error("Seed failed:", err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
