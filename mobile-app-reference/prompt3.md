You are working inside my existing LEANR mobile application project in VS Code.

I am providing:
1. The complete LEANR Web Application PRD
2. The existing mobile application codebase
3. The approved Coach Portal UI reference image

Your task is to build/complete the Coach Mobile Portal with STRICT 1:1 functional and workflow parity with the existing LEANR Web Application.

==================================================
NON-NEGOTIABLE RULE
==================================================

The Web Application PRD is the SINGLE SOURCE OF TRUTH.

The mobile app must NOT become a simplified version of the web application.

Do NOT:
- Add features that do not exist on web.
- Remove web features.
- Change any workflow.
- Change business rules.
- Change permissions.
- Change validations.
- Change session lifecycle.
- Create mobile-only business logic.
- Create a separate database.
- Invent new coach capabilities.

The UI image is ONLY the visual reference.

PRD = functionality + workflow + business rules
UI IMAGE = visual design + mobile layout

If there is any conflict, ALWAYS follow the PRD.

==================================================
1. FIRST AUDIT THE EXISTING PROJECT
==================================================

Before coding:

- Inspect the entire existing mobile codebase.
- Identify existing Coach functionality.
- Identify existing screens/components.
- Identify existing navigation.
- Identify existing APIs/services.
- Identify existing authentication.
- Identify existing session/coach/client logic.
- Identify incomplete functionality.
- Identify functionality that differs from the web application.

Do NOT rebuild already-working functionality unnecessarily.

Create a Web → Mobile feature mapping before implementation.

==================================================
2. COACH LOGIN
==================================================

Implement the exact Coach authentication flow from the PRD.

After successful authentication:

Login
↓
Fetch authenticated Coach
↓
Fetch Coach profile
↓
Fetch Coach permissions
↓
Fetch Coach dashboard data
↓
Open Coach Portal

Do not hard-code coach information.

==================================================
3. COACH DASHBOARD
==================================================

The Coach Dashboard must contain every KPI and information available to the coach on the web application.

Use real backend data.

Where defined by the PRD, show:

- Today's booked sessions
- Upcoming sessions
- Completed sessions
- Missed sessions
- Utilization
- Average rating
- Active escalations
- Pending tasks
- Client-related indicators
- Other PRD-defined coach KPIs.

Do NOT invent additional KPIs.

Dashboard data must update from the backend.

==================================================
4. TODAY'S SCHEDULE
==================================================

Implement the exact web schedule experience.

Coach must be able to:

- View today's sessions.
- View upcoming sessions.
- Open session details.
- View client information.
- Join the Zoom session.
- Perform permitted session actions.
- View session status.

Sessions must appear in the same logical order as web.

==================================================
5. SESSION WORKFLOW — CRITICAL
==================================================

Preserve the exact web session lifecycle.

Coach:

Upcoming Session
↓
Join Session
↓
Session takes place
↓
Session ends
↓
Attendance
↓
Session Notes
↓
Save
↓
Session Completed

IMPORTANT:

Do NOT allow attendance to be marked before the permitted stage.

The coach must join before attendance if that is the web rule.

Attendance must follow the exact web validation.

Statuses must match the web application, including where applicable:

- Present
- Late
- Absent

If Present/Late requires notes, enforce the same requirement.

If Absent is terminal, preserve that behaviour.

Do not create a different mobile session-completion process.

==================================================
6. SESSION NOTES
==================================================

Coach must be able to add/update session notes exactly as permitted by the web application.

Notes must be attached to the correct session and client.

Preserve:

- Required/optional status
- Validation
- Save behaviour
- Editing restrictions
- Session status rules.

Notes must be stored in the same backend used by web.

==================================================
7. CLIENT MANAGEMENT
==================================================

Implement the complete Coach → Clients functionality from the PRD.

Coach can see only clients they are permitted to access.

Provide the same web functionality for:

- Assigned clients
- Client list
- Client search/filter
- Client status
- Client details
- Client journey information
- Sessions
- Progress
- Notes/concerns
- Other PRD-defined information.

Do NOT allow the coach to edit information that is read-only on web.

==================================================
8. CLIENT PROFILE
==================================================

When Coach opens a client:

Show the same information available on web.

Where supported by the PRD:

- Personal details
- Fitness goals
- Measurements
- Diet preferences
- Progress
- Session history
- Notes
- Concerns
- Subscription information permitted to coach
- Other web-defined information.

Every client reference must open the correct client profile.

==================================================
9. GLOBAL CLIENT SEARCH
==================================================

If the web application provides global client search:

Implement it exactly.

Search using the same supported identifiers, such as:

- Client ID
- Client name

Preserve the web permission model.

For clients not assigned to the coach:

- Follow the exact web read-only behaviour.
- Do not provide editing actions unless web permits them.

==================================================
10. COACH CHAT
==================================================

Implement Coach chat exactly as documented in the PRD.

Preserve:

- Assigned client conversations
- Realtime messaging
- Read/unread state
- Chat notifications
- Historical conversations
- Closed/reassigned conversations
- Read-only restrictions
- Any other PRD-defined chat behaviour.

Do NOT create chat access for clients/coaches where web does not provide it.

==================================================
11. CLIENT PROGRESS
==================================================

Implement the exact Coach view of client progress.

Where supported:

- Progress measurements
- Graphs
- Transformation/progress data
- Measurement history
- Progress photos
- Other PRD-defined information.

Do not allow editing if web only allows viewing.

==================================================
12. ESCALATIONS
==================================================

Implement the Coach Escalations section exactly as web.

Coach must be able to see the appropriate escalation records.

Preserve:

- Active escalations
- Resolved escalations
- Client
- Reason
- Status
- Dates
- Relevant actions/permissions.

Do not create additional escalation actions.

If resolution requires Admin confirmation/call confirmation, preserve that exact workflow.

==================================================
13. RENEWAL OPPORTUNITIES
==================================================

Implement the Coach Renewal Opportunities functionality exactly as documented.

Use real client/subscription data.

Preserve:

- Eligible clients
- Renewal status
- Relevant plan information
- Renewal timing
- Required coach actions
- Existing web workflow.

Do not invent sales functionality.

==================================================
14. COACH AVAILABILITY
==================================================

Implement Coach Availability exactly as web.

Where supported:

- View availability
- Add availability
- Edit availability
- Remove availability
- Available slots
- Occupied slots
- Working hours
- Date-specific availability
- Other PRD-defined controls.

All availability changes must use the same backend rules as web.

==================================================
15. LEAVE REQUEST
==================================================

If the web Coach Portal allows Coach leave requests:

Implement the exact flow.

Coach:
↓
Leave Request
↓
Select dates
↓
Submit
↓
Admin review
↓
Approved / Rejected

Preserve the web rules.

Do not directly assign shadow coaches from Coach Portal unless the PRD explicitly allows it.

==================================================
16. PROFILE
==================================================

Implement the exact Coach Profile functionality from web.

Where permitted:

- Profile information
- Profile photo
- Phone
- Bio
- Certifications
- Languages
- Skills/specializations
- Other editable information defined by PRD.

Preserve which fields are editable and which are read-only.

==================================================
17. PERFORMANCE
==================================================

Implement the Coach Performance functionality exactly as web.

Show only metrics documented by the PRD.

Where applicable:

- Active clients
- Completed sessions
- Attendance
- No-show %
- Capacity
- Available capacity
- Weekly sessions
- Monthly sessions
- Average session duration
- Escalations
- Coach-change requests
- Average rating
- Activity timeline
- Other PRD-defined metrics.

Do NOT add unsupported analytics.

==================================================
18. NOTIFICATIONS
==================================================

Implement Coach Notifications exactly as web.

Use actual backend events.

Where supported:

- New client assignment
- Session reminders
- Client updates
- Plan/renewal alerts
- Escalations
- System notifications
- Other PRD-defined notifications.

Do not create static/fake notifications.

==================================================
19. COACH CHANGE REQUESTS
==================================================

If the Coach has visibility into Coach Change Requests:

Implement the exact web workflow and permission.

Do not allow the Coach to bypass Admin approval.

Preserve:

- Request
- Status
- Reason
- Client
- Admin handling
- Final state.

==================================================
20. SESSION RESCHEDULING
==================================================

Implement ONLY the rescheduling functionality that exists in the web application.

Preserve:

- Eligibility
- Cutoffs
- Approval rules
- Availability checking
- Coach/client permissions
- Slot selection
- Booking update
- Notifications.

Do not create a new coach-controlled rescheduling system.

==================================================
21. ZOOM
==================================================

Use the same Zoom integration/business logic as web.

The Coach should join the correct session using the existing session/Zoom data.

Do not create a separate Zoom integration.

==================================================
22. PERMISSIONS
==================================================

This is critical.

Coach permissions must exactly match web.

The Coach must NOT be able to:

- Edit client information that is read-only.
- Change subscriptions unless web permits it.
- Change assigned coach directly unless web permits it.
- Access admin-only functionality.
- Modify payment records unless web permits it.
- Bypass attendance rules.
- Bypass scheduling rules.
- Bypass escalation workflows.

==================================================
23. NAVIGATION
==================================================

Use the approved Coach Portal UI image.

Keep the approved visual structure.

Navigation should expose the same Coach functions as web.

Possible primary areas include only where supported by the PRD:

- Dashboard / Home
- Schedule
- Clients
- Chats
- Performance
- Search
- Profile / More

Do NOT add navigation items simply because they are common in other apps.

Every navigation item must map to a real web feature.

==================================================
24. MOBILE UI
==================================================

I am already satisfied with the approved mobile UI.

Do NOT redesign it.

Maintain:

- Typography
- Colours
- Cards
- Buttons
- Icons
- Bottom navigation
- Header
- Spacing
- Visual hierarchy
- Interaction patterns.

Convert web modals to suitable mobile interactions only when required, without changing the workflow.

==================================================
25. BACKEND
==================================================

Use the SAME backend, database and business logic as the web application.

Do NOT create:

- Separate coach database
- Duplicate coach system
- Mobile-only scheduling
- Mobile-only attendance
- Mobile-only notes
- Mobile-only client assignment
- Mobile-only performance calculations.

If an API layer is required for mobile, expose the existing business logic through an appropriate API.

Do not duplicate business rules inside the mobile application.

==================================================
26. REAL-TIME DATA
==================================================

Where the web application uses real-time updates:

Mobile must update appropriately.

Examples:

- New chat messages
- Session changes
- Client updates
- Notifications
- Availability changes
- Assignment changes.

Do not rely only on static locally cached data.

==================================================
27. ERROR / LOADING STATES
==================================================

Implement proper:

- Loading states
- Empty states
- Network errors
- Validation errors
- Permission errors
- Session conflicts
- Availability conflicts
- Authentication expiry
- Backend errors.

Do not silently fail.

==================================================
28. DO NOT INVENT
==================================================

If a feature is not documented in the PRD or existing web implementation:

DO NOT add it.

If something is unclear:

Inspect the existing web implementation/code first.

If still unclear, flag it instead of inventing behaviour.

==================================================
29. IMPLEMENTATION ORDER
==================================================

Follow this sequence:

1. Audit existing mobile Coach Portal.
2. Study complete PRD.
3. Map every Coach web feature.
4. Identify already implemented features.
5. Identify missing features.
6. Identify incorrect mobile behaviour.
7. Fix backend/API integration.
8. Implement authentication.
9. Implement journey/navigation.
10. Implement dashboard.
11. Implement schedule/session workflow.
12. Implement attendance + notes.
13. Implement clients/client profiles.
14. Implement chat.
15. Implement progress.
16. Implement escalations.
17. Implement renewals.
18. Implement availability/leave.
19. Implement performance.
20. Implement notifications/profile.
21. Test every workflow.
22. Perform final web-parity audit.

==================================================
30. FINAL WEB-PARITY AUDIT
==================================================

Before declaring completion, create a table:

Feature ID
→ Web Feature
→ Web Workflow
→ Mobile Screen
→ Mobile Function
→ Backend/API
→ Permission
→ Validation
→ Journey/State
→ Tested

Every Coach feature in the PRD must be accounted for.

Mark:

IMPLEMENTED
PARTIALLY IMPLEMENTED
MISSING
INCORRECT

Do not claim 100% completion if anything is missing.

==================================================
FINAL OBJECTIVE
==================================================

The finished Coach Mobile Portal must be:

THE SAME LEANR COACH PORTAL AS WEB

with:

SAME FEATURES
SAME WORKFLOW
SAME BUSINESS RULES
SAME PERMISSIONS
SAME DATA
SAME SESSION LIFECYCLE
SAME ATTENDANCE LOGIC
SAME NOTES LOGIC
SAME CLIENT ACCESS
SAME CHAT LOGIC
SAME SCHEDULING LOGIC
SAME COACH LOGIC
SAME BACKEND

Only the UI/presentation is adapted for mobile.

Use:
PRD → functionality and workflow
Approved Coach UI image → visual design
Existing VS Code project → implementation base

ZERO EXTRA FEATURES.
ZERO REMOVED WEB FEATURES.
ZERO WORKFLOW CHANGES.