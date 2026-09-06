CLIENT PORTAL — POST PLAN PURCHASE IMPLEMENTATION

You are working on the existing LEANR mobile application in VS Code.

I am providing:
1. Complete LEANR Web Application PRD
2. Existing mobile application codebase
3. Approved Client Portal UI reference image

Your task is to implement the complete Client journey AFTER a client purchases a plan.

IMPORTANT:
The Web Application PRD is the SINGLE SOURCE OF TRUTH for functionality and workflow.

The approved UI image is the visual reference.

Do NOT:
- Add functionality that does not exist in the web application.
- Remove any web functionality.
- Change any web workflow.
- Change business rules.
- Change permissions.
- Create separate mobile business logic.
- Create a separate database/workflow.
- Redesign the approved UI.

==================================================
CLIENT POST-PURCHASE FLOW
==================================================

The exact journey must be:

PLAN SELECTION
↓
RAZORPAY PAYMENT
↓
PAYMENT VERIFICATION
↓
PAYMENT SUCCESS
↓
PLAN ACTIVATION
↓
SELECT START DATE
↓
ONBOARDING
↓
SCHEDULE SETUP
↓
COACH AVAILABILITY MATCHING
↓
COACH ASSIGNMENT
↓
RECURRING SCHEDULE CREATION
↓
ACTIVE CLIENT PORTAL

Every transition must follow the existing web application's PRD and backend logic.

==================================================
1. PLAN SELECTION
==================================================

Use the exact plans, pricing, plan details and eligibility rules from the PRD.

Do not create new plans or pricing.

Show the same information and purchase options as the web application.

==================================================
2. PAYMENT
==================================================

Use the existing Razorpay integration/business logic.

Flow:

Select Plan
→ Create Payment Order through backend
→ Open Razorpay Mobile Checkout
→ Receive payment result
→ Backend verifies payment/signature
→ Update subscription/payment state
→ Show success/failure accordingly

Never trust mobile-only payment success.

Prevent duplicate payments/orders according to the web application's implementation.

==================================================
3. PAYMENT SUCCESS
==================================================

After successful verified payment:

- Refresh client state from backend.
- Show payment success.
- Show purchased plan details.
- Move client into the exact next journey state used by web.

Do not require app restart.

==================================================
4. PLAN ACTIVATION
==================================================

Show the exact activation workflow from the web application.

Client must be able to select the permitted plan start date.

Apply all web validations.

Do not create a different activation process.

==================================================
5. ONBOARDING
==================================================

Implement every onboarding field/question present in the PRD.

Preserve:

- Required fields
- Optional fields
- Validation
- Fitness goals
- Preferences
- Other client information
- Completion rules

Do not skip onboarding steps that exist on web.

==================================================
6. SCHEDULE SETUP
==================================================

THIS IS A CRITICAL PART.

Implement the complete web Schedule Setup flow.

The client must be able to configure the schedule using the same options available on web, including where defined:

- Preferred time
- Schedule pattern
- Standard
- Pair
- Custom
- Custom days
- Trainer preference
- Gender preference
- Other PRD-defined scheduling preferences

If the web application defaults to a specific schedule pattern such as M/W/F, preserve the same behaviour.

Do not replace the web scheduling system with a simplified calendar.

==================================================
7. COACH AVAILABILITY MATCHING
==================================================

After schedule preferences are submitted:

Client preferences
+
Schedule requirements
+
Coach availability
+
Existing web matching rules
↓
Coach matching

Use the same backend/business logic as web.

Do not allow mobile to invent its own coach assignment logic.

==================================================
8. COACH ASSIGNMENT
==================================================

Once a coach is successfully matched:

- Show assigned coach.
- Show coach information permitted by the PRD.
- Create/confirm the required recurring schedule.
- Update the client's journey state.

Follow the exact web assignment/fallback rules.

==================================================
9. RECURRING SCHEDULE
==================================================

Create recurring bookings exactly as the web application does.

Preserve:

- Selected days
- Selected time
- Coach
- Session frequency
- Start date
- Subscription/session limits
- Availability rules
- Booking generation rules.

Do not generate duplicate sessions.

Handle race conditions/idempotency exactly as required by the backend.

==================================================
10. ACTIVE CLIENT PORTAL
==================================================

After successful activation, onboarding and schedule creation:

Automatically transition to the Active Client Portal.

The client should see ALL applicable client features documented in the PRD.

These may include:

- Today Task / Dashboard
- My Chats
- My Sessions
- My Schedule
- My Coach
- Coach Profile
- Progress
- Measurements
- Subscription
- My Concerns
- Notifications
- Profile
- Book a Session where permitted
- Renewal functionality
- Other client functions explicitly documented in the PRD

Do not assume every feature is always visible.

Visibility must follow the exact web journey state and permissions.

==================================================
11. DYNAMIC NAVIGATION
==================================================

Navigation must automatically change according to backend journey state.

Example:

Payment pending
→ Payment experience

Payment successful
→ Activation

Activation pending
→ Activation

Onboarding pending
→ Onboarding

Schedule pending
→ Schedule Setup

Coach matching
→ Matching/assignment state

Active
→ Full Client Portal

The backend journey state is the source of truth.

==================================================
12. CLIENT SESSION FUNCTIONS
==================================================

Implement all web-defined session functions, including where applicable:

- View upcoming sessions
- View completed sessions
- View cancelled sessions
- View missed sessions
- View rescheduled sessions
- Join session
- Cancel session
- Reschedule session
- Rate session
- View session history

Use the exact web restrictions and cutoff times.

==================================================
13. MY COACH
==================================================

Implement the complete web-equivalent My Coach experience.

Show the information permitted by the PRD.

If coach-change functionality exists:

Use the exact web Coach Change Request workflow.

Do not directly change coaches from mobile unless the web application permits it.

==================================================
14. MY CHATS
==================================================

After the client becomes eligible for chat according to the PRD:

Implement the exact web chat experience.

Preserve:

- Coach conversation
- Realtime messages
- Read/unread state
- Notifications
- Historical conversations
- Old/reassigned coach behaviour
- Chat permissions.

==================================================
15. PROGRESS & MEASUREMENTS
==================================================

Implement the complete web functionality.

Include only PRD-defined:

- Measurements
- Progress graphs
- Progress summary
- Historical measurements
- Photos
- Update measurement
- Restrictions/validation.

Preserve the web measurement update rules.

==================================================
16. SUBSCRIPTION
==================================================

Implement the exact web subscription functionality.

Where supported by the PRD:

- Current plan
- Plan details
- Start/end dates
- Sessions remaining
- Pause
- Resume
- Renewal
- Subscription status
- Payment/billing information

Do not add unsupported subscription controls.

==================================================
17. MY CONCERNS
==================================================

Implement the exact web concern workflow:

- Raise concern
- Select category
- Add details
- Track status
- View resolution
- Relevant coach/admin interaction

No additional support workflow should be invented.

==================================================
18. NOTIFICATIONS
==================================================

Implement notifications according to the PRD.

Use real backend events.

Examples only if supported by PRD:

- Session reminders
- Coach updates
- Chat messages
- Subscription updates
- System notifications

Do not create fake notification functionality.

==================================================
19. PROFILE
==================================================

Implement all client profile functions documented in the PRD.

Preserve:

- Edit profile
- Profile information
- Profile photo
- Password/credentials where supported
- My Coach
- My Schedule
- Subscription
- My Concerns
- Notifications
- Logout
- Other PRD-defined options.

==================================================
20. GATES & BUSINESS RULES
==================================================

All web gates must work identically on mobile.

Examples include:

- Phone verification
- Measurement freshness
- Low sessions
- Journey-state restrictions
- Booking restrictions
- Cancellation cutoff
- Rescheduling cutoff
- Rescheduling limits
- Rating restrictions
- Progress update restrictions
- Subscription restrictions.

Do not bypass any gate.

==================================================
21. BACKEND PARITY
==================================================

Use the same backend/database/business logic as the web application.

Do not create:

- Mobile-only database
- Mobile-only subscription system
- Mobile-only scheduling engine
- Mobile-only coach matching
- Mobile-only session system
- Duplicate business rules.

If the current architecture requires an API layer for mobile, create/use the API layer while preserving the existing business logic.

==================================================
22. UI
==================================================

I am already happy with the approved mobile UI.

KEEP THE UI.

Do not redesign.

Maintain:

- Existing visual design
- Typography
- Colors
- Cards
- Buttons
- Navigation
- Icons
- Spacing
- Header
- Bottom navigation
- Mobile interaction patterns.

Only create additional screens where required by the PRD.

==================================================
23. EXISTING CODE
==================================================

Some functionality is already implemented in the VS Code project.

Before coding:

1. Inspect the complete existing code.
2. Identify implemented functionality.
3. Identify incomplete functionality.
4. Identify incorrect functionality.
5. Compare everything against the PRD.
6. Reuse existing components/services.
7. Implement only the missing/corrective work.

Do NOT unnecessarily rewrite working functionality.

==================================================
24. FINAL WEB-PARITY AUDIT
==================================================

Before declaring completion, create a complete audit:

Feature ID
→ Web Function
→ Web Workflow
→ Mobile Screen
→ Mobile Function
→ Backend/API
→ Permission
→ Validation
→ Journey State
→ Tested

Every client feature in the PRD must be accounted for.

If anything is missing, clearly report it.

If anything in the existing mobile application conflicts with the PRD, correct it.

==================================================
FINAL RULE
==================================================

The final result must be:

LEANR WEB APPLICATION
=
LEANR MOBILE APPLICATION

Same:
- Features
- Workflow
- Business rules
- Data
- Backend
- Permissions
- Journey states
- Validations
- Integrations

ONLY the presentation is adapted for mobile.

Do not add anything that does not exist in the web application.

Do not remove anything that exists in the web application.

Do not change the process.

Use the PRD to determine functionality.
Use the approved UI image to determine visual implementation.
Use the existing VS Code project as the starting implementation.