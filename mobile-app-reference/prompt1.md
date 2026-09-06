You are working inside my existing LEANR mobile application project in VS Code.

I am providing:
1. The complete PRD/documentation of the existing LEANR Web Application.
2. The existing mobile application codebase.
3. A UI/UX reference image showing the Client Portal design and journey.

Your job is to COMPLETE and ALIGN the existing mobile application with the existing web application.

IMPORTANT:
The PRD is the SINGLE SOURCE OF TRUTH for functionality, workflow, business rules, permissions, validations, states and integrations.

The UI reference image is the SINGLE SOURCE OF TRUTH for the visual style/layout that I have approved.

Do NOT redesign the UI.
Do NOT invent functionality.
Do NOT remove web functionality.
Do NOT modify web business logic.
Do NOT create a different mobile workflow.

The final mobile application must provide the SAME EXPERIENCE and SAME FUNCTIONAL BEHAVIOUR as the web application, adapted only to mobile screen size.

==================================================
1. FIRST: STUDY THE EXISTING PROJECT
==================================================

Before writing code:

- Inspect the complete existing mobile codebase.
- Identify what has already been implemented.
- Identify existing screens, components, navigation, APIs, database calls, authentication and state management.
- Do NOT rebuild functionality that already exists.
- Reuse existing components and logic wherever possible.
- Identify incomplete, placeholder or incorrectly implemented functionality.
- Create an internal implementation checklist before modifying anything.

Then study the attached PRD completely.

Map:

PRD feature
→ Web workflow
→ Existing mobile implementation
→ Missing implementation
→ Required mobile screen/component
→ Required backend/API integration.

Do not begin randomly coding screens.

==================================================
2. WEB APPLICATION = FUNCTIONAL SOURCE OF TRUTH
==================================================

Every client function in the PRD must exist in the mobile application wherever the same client role has permission to use it.

Preserve exactly:

- Authentication
- Authorization
- Client journey states
- Navigation rules
- Feature visibility
- Validation
- Business rules
- Scheduling rules
- Booking rules
- Cancellation rules
- Rescheduling rules
- Coach assignment
- Subscription rules
- Payment flow
- Session rules
- Attendance/status behaviour
- Progress rules
- Chat permissions
- Concern/escalation rules
- Notifications
- Profile behaviour
- Renewal behaviour
- All integrations.

If the web application has a restriction, the mobile application must have the SAME restriction.

If the web application hides a feature in a particular journey state, mobile must hide it too.

If the web application shows a feature in a particular journey state, mobile must show it too.

==================================================
3. CLIENT JOURNEY MUST BE STATE-DRIVEN
==================================================

Do NOT hard-code one Client Portal navigation for everyone.

The application must automatically determine the client's current journey state from the backend.

Flow:

OPEN APP
↓
PUBLIC LANDING
↓
LOGIN / SIGN UP
↓
CLIENT AUTHENTICATION
↓
FETCH CLIENT PROFILE + JOURNEY STATE
↓
RENDER CORRECT CLIENT EXPERIENCE

The mobile application must react automatically when the journey state changes.

==================================================
4. CLIENT BEFORE DEMO / BEFORE PLAN
==================================================

If the authenticated client has:

- No purchased plan
- No booked demo

show the exact pre-demo experience allowed by the PRD.

Primary actions:

- Book Free Demo
- Explore / Purchase Plans

Do not allow anonymous users to directly create a demo booking.

Authentication must happen first.

==================================================
5. DEMO BOOKING
==================================================

Implement the EXACT demo-booking workflow from the PRD.

Use the same:

- Date selection
- Time selection
- Coach gender preference
- Validation
- Availability logic
- Coach assignment logic
- Booking creation
- Confirmation
- Error handling.

The client must NOT manually choose a coach if the web application automatically assigns one.

After successful booking:

- Refresh/re-fetch client journey state.
- Update the UI automatically.
- Show the correct demo-booked experience.

Do NOT require the user to restart the app or manually navigate to see the new state.

==================================================
6. AFTER DEMO BOOKING
==================================================

When journey state becomes:

demo_booked

automatically transition to the web-equivalent Demo Booked experience.

Show ONLY features permitted by the existing web application.

This may include, according to the PRD:

- Demo details
- My Schedule
- Assigned Coach
- Coach Profile
- Plans
- Notifications
- Profile
- Applicable session actions
- Demo reschedule/cancellation where permitted.

IMPORTANT:

Do not enable My Chats simply because the demo is booked if the web application's permission rule does not allow chat at this stage.

Every feature must follow the PRD.

==================================================
7. DEMO COMPLETED
==================================================

When the demo is completed:

demo_booked
↓
demo_completed
↓
Feedback / Rating flow
↓
Choose Plan
↓
Purchase

Implement the exact web workflow.

Preserve:

- Rating
- Feedback
- Skip behaviour
- Demo completion state
- Plan-selection transition.

==================================================
8. PLAN PURCHASE
==================================================

Implement the same plan and payment workflow as web.

Flow:

Choose Plan
↓
Payment
↓
Razorpay
↓
Backend order creation
↓
Payment verification
↓
Subscription/payment state update
↓
Activation

Do NOT put payment verification logic only on the mobile client.

Use the existing backend/business logic.

Never trust a mobile-only payment success response.

==================================================
9. FIRST-TIME PLAN ACTIVATION
==================================================

After successful purchase, follow the exact web workflow:

Purchase
↓
Payment Success
↓
Activate Plan
↓
Choose Start Date
↓
Onboarding
↓
Schedule Setup
↓
Coach Matching
↓
Coach Assignment
↓
Recurring Schedule
↓
Active Client

The Schedule Setup screen MUST include every option present in the web application.

For example, where specified by the PRD:

- Time
- Schedule pattern
- Standard
- Pair
- Custom
- Custom days
- Trainer preference
- Gender preference
- Availability matching
- Confirmation.

Do NOT simplify or remove these options.

The same coach-availability matching logic must be used.

==================================================
10. ACTIVE CLIENT PORTAL
==================================================

After activation/onboarding/scheduling, show the complete Active Client Portal.

Implement every client feature documented in the PRD, including the applicable:

- Today Task / Dashboard
- My Sessions
- My Schedule
- My Chats
- My Coach
- Coach Profile
- Book a Session where permitted
- Progress
- Measurements
- Subscription
- My Concerns
- Notifications
- Profile
- Renewal flows
- Any other client feature explicitly documented in the PRD.

Do NOT add features that are not in the PRD.

==================================================
11. NAVIGATION
==================================================

Use the approved mobile UI from the provided reference image.

Keep the same:

- Bottom navigation concept
- Profile/menu concept
- Card structure
- Visual hierarchy
- Screen organization
- Mobile interaction patterns.

But the actual navigation items and visibility MUST follow the PRD.

Navigation must dynamically change based on journey state.

Example:

No Plan
→ limited/pre-plan navigation

Demo Booked
→ demo-appropriate navigation

Active Client
→ complete client navigation

Renewal / other states
→ corresponding web workflow.

==================================================
12. GATES AND RESTRICTIONS
==================================================

Implement all gates documented in the PRD.

Do not bypass them on mobile.

Examples include:

- Phone verification gate
- Measurement freshness gate
- Low-session gate
- Journey-state routing
- Chat eligibility
- Booking restrictions
- Session cancellation cutoff
- Rescheduling cutoff
- Reschedule limits
- Rating eligibility
- Progress update restrictions
- Subscription restrictions.

The backend must remain authoritative.

==================================================
13. SESSIONS
==================================================

Implement the exact web session lifecycle.

Where applicable:

- Upcoming
- Completed
- Cancelled
- Missed
- Rescheduled
- Session details
- Join session
- Cancel
- Reschedule
- Rating
- Session history.

Use the exact web rules and cutoffs from the PRD.

==================================================
14. MY COACH
==================================================

Implement the exact web coach experience.

Client should be able to see the coach information permitted by the web application.

Where applicable:

- Coach photo
- Name
- Profile
- Specializations
- Experience
- Rating
- Other PRD-defined information.

Coach-change functionality must follow the exact web workflow and permissions.

==================================================
15. CHAT
==================================================

Implement chat exactly as documented in the PRD.

Do NOT invent chat permissions.

Preserve:

- Eligibility
- Conversation creation
- Realtime behaviour
- Message state
- Read/unread behaviour
- Historical conversations
- Reassigned/old coach behaviour
- Any restrictions.

==================================================
16. PROGRESS & MEASUREMENTS
==================================================

Implement the complete web-equivalent progress experience.

Preserve:

- Measurement fields
- Measurement update rules
- Graphs
- Progress summary
- Historical data
- Photo/progress functionality where documented
- Measurement restrictions
- 7-day or other PRD-defined restrictions.

==================================================
17. SUBSCRIPTION
==================================================

Implement the exact web subscription functionality.

Where documented:

- Current plan
- Plan details
- Sessions remaining
- Renewal
- Pause
- Resume
- Subscription state
- Billing/payment information.

Do not add subscription functionality that does not exist on web.

==================================================
18. CONCERNS / SUPPORT
==================================================

Implement the exact My Concerns workflow from the PRD.

Preserve:

- Raise concern
- Category
- Description
- Status
- Open/In Progress/Resolved states
- Relevant coach/admin workflow.

==================================================
19. PROFILE
==================================================

Implement the complete client profile functionality documented in the PRD.

Preserve:

- Personal information
- Profile photo
- Password/change credentials where supported
- Coach
- Schedule
- Subscription
- Concerns
- Notifications
- Logout
- Other PRD-defined options.

==================================================
20. NOTIFICATIONS
==================================================

Implement the notification experience according to the PRD.

Notifications must reflect actual backend events.

Do not create fake/static notification data.

==================================================
21. BACKEND ARCHITECTURE
==================================================

The mobile application must use the same backend/database/business logic as the web application.

Do NOT create:

- Separate mobile database
- Duplicate business rules
- Duplicate subscription system
- Duplicate scheduling engine
- Duplicate coach assignment logic.

Reuse existing APIs/services/RPC/business logic wherever possible.

If the web application uses server-side logic that mobile cannot directly call, expose/use an appropriate API layer without changing the underlying business logic.

==================================================
22. DATA CONSISTENCY
==================================================

Web and mobile must use the same:

- Users
- Clients
- Coaches
- Plans
- Subscriptions
- Sessions
- Schedules
- Measurements
- Chats
- Concerns
- Notifications
- Payments
- Journey states.

A change made on web must be visible on mobile.

A change made on mobile must be visible on web.

==================================================
23. UI IMPLEMENTATION
==================================================

I am already happy with the current approved mobile UI.

Therefore:

DO NOT redesign it.

Keep:

- Existing design system
- Typography
- Spacing
- Cards
- Buttons
- Bottom navigation
- Header
- Icons
- Colours
- Visual hierarchy
- Interaction patterns.

Only add/modify screens when required to achieve complete PRD functionality.

For web modals, use an appropriate mobile presentation such as bottom sheet only where necessary, without changing the workflow.

==================================================
24. ERROR / EMPTY / LOADING STATES
==================================================

Every implementation must handle:

- Loading
- Empty state
- API failure
- Network failure
- Validation error
- Permission denial
- Expired session
- Booking conflict
- Payment failure
- Availability conflict
- State transition failure.

Use meaningful user-friendly messages.

==================================================
25. DO NOT ASSUME
==================================================

If something is not clearly defined in:

1. Existing code
2. PRD
3. Existing web implementation

DO NOT invent a new business rule.

Inspect the existing implementation first.

If still unclear, flag it instead of silently changing functionality.

==================================================
26. IMPLEMENTATION PROCESS
==================================================

Follow this order:

STEP 1
Audit existing mobile project.

STEP 2
Study complete PRD.

STEP 3
Create Web → Mobile feature mapping.

STEP 4
Identify missing/incomplete functions.

STEP 5
Identify incorrect mobile functions that differ from web.

STEP 6
Fix architecture/API integration.

STEP 7
Implement Client journey states.

STEP 8
Implement screens and navigation.

STEP 9
Implement every missing function.

STEP 10
Implement validations, gates and permissions.

STEP 11
Test every journey end-to-end.

STEP 12
Compare mobile behaviour against PRD/web behaviour.

STEP 13
Fix all discrepancies.

==================================================
27. REQUIRED FINAL AUDIT
==================================================

Before declaring completion, create a checklist:

Feature ID
→ Web behaviour
→ Mobile screen
→ Mobile implementation
→ Backend/API
→ Permission
→ Validation
→ Journey state
→ Tested: YES/NO

There must be NO unresolved missing client functionality.

Also provide:

1. Features already implemented
2. Features newly implemented
3. Features modified to match web
4. Any remaining gaps
5. Any PRD ambiguity requiring a decision

Do not claim completion if any documented web functionality is missing.

==================================================
FINAL OBJECTIVE
==================================================

Build the LEANR Client Mobile Portal so that:

WEB APPLICATION
=
SAME FEATURES
+
SAME WORKFLOW
+
SAME BUSINESS RULES
+
SAME DATA
+
SAME PERMISSIONS
+
SAME JOURNEY STATES

while the mobile application uses the approved mobile UI/UX.

The mobile app should feel like the same LEANR product on mobile — NOT a simplified or redesigned version.

Use the attached PRD for functionality.

Use the approved UI image for visual implementation.

Use the existing VS Code project as the implementation base.

Do not add anything that does not exist in the web application.
Do not remove anything that exists in the web application.
Do not change the workflow.