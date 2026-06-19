// ======================================================================
// BLUEDAWS HOTEL — EmailJS Configuration
// ======================================================================
//
// SETUP (5 minutes, free at https://www.emailjs.com):
//
// 1. Sign up at emailjs.com → go to "Email Services" → Add Gmail
//    Copy the Service ID (looks like "service_xxxxxxx")
//
// 2. Go to "Email Templates" → Create Template (click "+" twice — need 3)
//
//    Template 1 — Hotel notification when booking arrives:
//      Name it: booking_notification
//      Subject: New Booking {{ref}} – {{guest_name}}
//      Body (copy-paste):
//        New booking received on {{date_received}}
//        Reference: {{ref}}
//        Guest: {{guest_name}}  |  Email: {{guest_email}}  |  Phone: {{guest_phone}}
//        Room: {{room_name}}
//        Check-in: {{checkin}}  |  Check-out: {{checkout}}  |  Nights: {{nights}}
//        Guests: {{guests}}
//        Total: £{{total}}  |  Payment: {{payment}}
//        Special Requests: {{requests}}
//      To Email: {{to_email}}   (set "To" field to: {{to_email}})
//
//    Template 2 — Confirmation email to guest:
//      Name it: booking_confirmation
//      Subject: Booking Confirmed {{ref}} – Bluedaws Hotel
//      Body (copy-paste):
//        Dear {{guest_name}},
//        Your booking at Bluedaws Private Hotel has been received.
//        Reference: {{ref}}
//        Room: {{room_name}}
//        Check-in: {{checkin}} (from 1:00 PM)
//        Check-out: {{checkout}} (by 12:00 PM)
//        Nights: {{nights}}  |  Total: £{{total}}  |  Payment: {{payment}}
//        Includes: Free Wi-Fi · Breakfast · Heating & Fan · Hair Dryer · Towels
//        We will confirm within 24 hours. Questions? reservations@bluedawshotel.com
//        – The Bluedaws Team
//      To Email: {{to_email}}
//
//    Template 3 — Contact form message:
//      Name it: contact_message
//      Subject: Website Enquiry – {{subject_label}}
//      Body (copy-paste):
//        Message via website contact form
//        From: {{from_name}} ({{from_email}})  |  Phone: {{phone}}
//        Subject: {{subject_label}}
//        {{message}}
//      To Email: {{to_email}}
//
// 3. Go to Account → General → copy "Public Key"
//
// 4. Fill in the 6 values below and save:
// ======================================================================

const EMAILJS = {
  publicKey:                   'YOUR_PUBLIC_KEY',         // Account → General → Public Key
  serviceId:                   'YOUR_SERVICE_ID',         // Email Services → your Gmail service ID
  bookingNotificationTemplate: 'YOUR_BOOKING_NOTIF_ID',  // Template 1 ID
  bookingConfirmTemplate:      'YOUR_BOOKING_CONFIRM_ID', // Template 2 ID
  contactTemplate:             'YOUR_CONTACT_TEMPLATE_ID',// Template 3 ID
  hotelEmail:                  'reservations@bluedawshotel.com',
};
