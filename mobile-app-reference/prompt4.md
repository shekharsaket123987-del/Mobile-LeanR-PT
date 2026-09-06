You are working inside my existing LEANR mobile application project in VS Code.

I am providing:
1. Complete LEANR Web Application PRD
2. Existing mobile application codebase
3. Approved Admin Portal UI reference image

Your task is to build/complete the Admin Mobile Portal with STRICT 1:1 functional and workflow parity with the existing LEANR Web Application.

==================================================
NON-NEGOTIABLE SOURCE OF TRUTH
==================================================

The existing Web Application PRD is the ONLY source of truth for:

- Functions
- Workflows
- Business rules
- Permissions
- Validations
- States
- Admin controls
- Scheduling
- Coach management
- Client management
- Reports
- Notifications
- Integrations

The approved Admin UI image is ONLY the visual reference.

DO NOT:
- Add any feature that does not exist on web.
- Remove any feature that exists on web.
- Change any web workflow.
- Change business rules.
- Change permissions.
- Change validations.
- Invent new admin functionality.
- Create mobile-only business logic.
- Create a separate database.
- Simplify complex admin workflows just because this is mobile.

If there is any conflict:
PRD / existing web behaviour ALWAYS wins.

==================================================
1. FIRST AUDIT THE EXISTING PROJECT
==================================================

Before writing code:

- Inspect the complete existing mobile project.
- Identify all existing Admin screens.
- Identify existing Admin components.
- Identify navigation.
- Identify APIs/services.
- Identify authentication/authorization.
- Identify already implemented functionality.
- Identify incomplete functionality.
- Identify functionality that differs from web.

Do NOT rebuild working functionality unnecessarily.

Create:

WEB ADMIN FUNCTION
→ EXISTING MOBILE FUNCTION
→ MISSING FUNCTION
→ REQUIRED SCREEN
→ REQUIRED API/BACKEND
→ PERMISSION
→ WORKFLOW

before implementation.

==================================================
2. ADMIN AUTHENTICATION
==================================================

Implement the exact Admin login/authentication flow from the web application.

After login:

Admin Authentication
↓
Verify Admin Permission
↓
Load Admin Profile
↓
Load Dashboard Data
↓
Admin Portal

Admin-only functions must never be accessible to Client or Coach users.

==================================================
3. ADMIN DASHBOARD
==================================================

Implement the complete web Admin Dashboard.

Use real backend data.

Include ALL dashboard KPIs and analytics documented by the PRD.

Where documented, this includes:

- Total clients
- Active PT clients
- Sessions booked today
- Cancelled sessions today
- Trainer utilization
- Peak booking hours
- Empty slots
- Revenue this month
- Active coaches
- Average coach rating
- Average sessions/day
- Renewal rate
- Revenue trend
- Average sessions/client
- Booking by hour
- Other PRD-defined dashboard information

Do NOT add extra analytics.

All calculations must follow the web application's existing logic.

==================================================
4. UNIVERSAL SEARCH
==================================================

Implement the exact Admin Search functionality from web.

Search using the identifiers supported by the PRD, such as:

- Client ID
- Client name
- Coach
- Other supported entities

Search results must open the same detail records as web.

Admin permissions must remain identical.

==================================================
5. CLIENT MANAGEMENT
==================================================

Admin must have the same client-management capabilities as web.

Client Detail must preserve all web-supported information and controls.

Where documented, Admin can:

- View client details
- Edit client details
- Adjust sessions
- Grant pause days
- Transfer coach
- Assign shadow coach
- Pause subscription
- Log measurement
- Log escalation
- Log refund request
- View sessions
- View subscription
- View progress
- View concerns
- View activity/history
- Perform other PRD-defined Admin actions

Do NOT add controls that web does not provide.

Every Admin action must use the same validation and business rules as web.

==================================================
6. COACH MANAGEMENT
==================================================

Implement complete Coach Management from web.

Admin must be able to perform exactly the actions permitted by the PRD.

Where documented:

- Add coach
- Edit coach
- Disable/delete coach
- View coach profile
- View coach clients
- View coach performance
- Manage coach availability
- Override/block slots
- Reassign clients
- Edit working hours
- Other PRD-defined controls

Preserve all web validations and permissions.

==================================================
7. SESSION MANAGEMENT
==================================================

Implement the complete Admin Sessions functionality.

Admin should be able to:

- View sessions
- Filter by date
- Filter by coach
- Filter by client
- View session status
- View attendance
- View notes where permitted
- View cancelled sessions
- View missed sessions
- View rescheduled sessions
- Perform Admin actions documented by PRD

Do NOT create additional session controls.

==================================================
8. AVAILABILITY MANAGEMENT
==================================================

Implement the exact web Availability functionality.

Admin must be able to view/manage availability exactly as allowed on web.

Where documented:

- Free slots
- Occupied slots
- Coach filter
- Client filter
- Date filter
- Coach availability
- Slot overrides
- Block/unblock slots
- Other PRD-defined controls

All availability changes must follow web rules.

==================================================
9. LEAVE REQUESTS
==================================================

Implement the complete Admin Leave Request workflow.

Coach Leave Request
↓
Admin receives request
↓
Review request
↓
Approve / Reject
↓
If Approved
↓
Shadow Coverage workflow
↓
Coverage status
↓
Uncovered occurrences handled according to web rules

Do NOT simplify this workflow.

==================================================
10. SHADOW COVERAGE
==================================================

THIS IS A CRITICAL ADMIN FUNCTION.

Implement the exact Shadow Coverage functionality from the web application.

Where applicable:

- View leave-related sessions
- Identify sessions requiring coverage
- Assign shadow coach
- Show covered/uncovered status
- Handle individual occurrences
- Preserve coach/client assignment rules
- Handle uncovered occurrences exactly as web
- Update relevant schedules/bookings
- Notify affected users where web does so

Do NOT invent a new shadow workflow.

The mobile Admin Portal must follow the same Shadow Coverage business logic as web.

==================================================
11. COACH CHANGE REQUESTS
==================================================

Implement the exact Coach Change Request workflow.

Admin must be able to:

- View requests
- View client
- View current coach
- View requested change/reason
- Approve/reject/process according to web
- Trigger the same coach reassignment/fallback logic
- Maintain correct status

Do not allow mobile to bypass Admin workflow.

==================================================
12. ESCALATIONS
==================================================

Implement the complete Admin Escalation workflow from web.

Preserve:

- Active escalations
- Escalation reason
- Client
- Coach
- Status
- Required action
- Call confirmation
- Resolution
- Admin confirmation
- Final status

If the web application requires Admin confirmation that the client was called before resolution, enforce the SAME requirement.

==================================================
13. RENEWAL OPPORTUNITIES
==================================================

Implement the complete Admin Renewal Opportunities functionality from web.

Use actual subscription/client data.

Preserve:

- Eligible clients
- Renewal state
- Plan details
- Renewal timing
- Assigned coach
- Required action
- Status
- Other PRD-defined information.

Do not create new sales workflows.

==================================================
14. REPORTS
==================================================

Implement ONLY the reports documented in the web application.

Preserve:

- Report types
- Filters
- Date ranges
- Calculations
- Data sources
- Export/PDF behaviour
- Permissions

Do NOT add "Custom Reports" or any other reporting functionality unless it exists in the PRD.

==================================================
15. ACTIVITY LOG
==================================================

Implement the exact Admin Activity Log.

Show the same web-supported activity information.

Where applicable:

- Date
- User/admin
- Action
- Entity
- Previous/new state
- Other PRD-defined information

Do not create additional audit information.

==================================================
16. NOTIFICATIONS
==================================================

Implement Admin Notifications according to the PRD.

Use real backend events.

Do not create static/fake notifications.

==================================================
17. SETTINGS
==================================================

Implement ONLY the Admin Settings functionality documented in the web application.

Where applicable:

- Plan settings
- Client profile settings
- Other PRD-defined configuration

Do not create additional system settings.

==================================================
18. ADMIN PROFILE
==================================================

Implement the Admin profile functionality available on web.

Preserve:

- Profile information
- Edit functionality where permitted
- Notifications
- Logout
- Other PRD-defined profile options.

==================================================
19. NAVIGATION
==================================================

Use the approved Admin Portal UI image as the visual reference.

The navigation must contain ALL Admin functions documented in the PRD.

Organize them into appropriate mobile navigation/menu sections without changing their functionality.

Possible primary areas may include:

- Dashboard
- Search
- Coaches
- Sessions
- Availability
- Profile / More

Additional Admin functions such as:

- Leave Requests
- Shadow Coverage
- Coach Change Requests
- Renewal Opportunities
- Reports
- Activity Log
- Notifications
- Settings

must remain accessible if they exist in the PRD.

Do NOT hide or remove a web function merely because it is not suitable for bottom navigation.

Use Profile/More or appropriate mobile navigation while keeping the same functionality.

==================================================
20. ADMIN PERMISSIONS
==================================================

Admin permissions must exactly match the web application.

Do NOT allow:

- Client-only actions outside Admin permissions
- Coach-only restrictions to incorrectly limit Admin
- Unauthorized data access
- Unauthorized coach changes
- Unauthorized subscription changes
- Unauthorized scheduling changes

All authorization must be enforced server-side.

==================================================
21. BACKEND PARITY
==================================================

Use the same backend/database/business logic as web.

Do NOT create:

- Separate Admin database
- Mobile-only Admin logic
- Duplicate scheduling engine
- Duplicate coach assignment logic
- Duplicate subscription logic
- Duplicate reporting calculations
- Duplicate shadow coverage logic.

If mobile requires APIs, expose the existing web business logic through the API layer.

Do not duplicate business rules in the mobile app.

==================================================
22. REAL-TIME / DATA REFRESH
==================================================

After every Admin state-changing action:

- Save through backend.
- Re-fetch/update relevant data.
- Update UI automatically.

Examples:

Approve Leave
→ Shadow Coverage updates automatically.

Assign Shadow Coach
→ Coverage status updates automatically.

Transfer Coach
→ Client/coach data updates automatically.

Approve Coach Change
→ Assignment updates automatically.

Change Availability
→ Availability view updates automatically.

Do not require app restart.

==================================================
23. UI REQUIREMENT
==================================================

I am already happy with the approved Admin mobile UI.

DO NOT redesign it.

Keep:

- Existing visual style
- Typography
- Colours
- Cards
- Buttons
- Icons
- Navigation style
- Spacing
- Layout
- Interaction patterns.

Only add screens/components required to achieve complete web parity.

For dense Admin tables, adapt them appropriately for mobile while preserving all information and actions.

==================================================
24. ERROR / LOADING STATES
==================================================

Implement:

- Loading
- Empty states
- API errors
- Validation errors
- Permission errors
- Network errors
- Conflicts
- Failed updates
- Authentication expiry

Do not silently fail.

==================================================
25. DO NOT INVENT
==================================================

If a feature is NOT present in:

- PRD
- Existing web application
- Existing web workflow

DO NOT add it.

If something is unclear:

1. Inspect existing implementation.
2. Check PRD.
3. Check existing business logic.
4. If still unclear, report the ambiguity.

Never invent an Admin workflow.

==================================================
26. IMPLEMENTATION ORDER
==================================================

Follow this order:

1. Audit existing mobile Admin Portal.
2. Study complete PRD.
3. Map every Admin web feature.
4. Identify existing mobile implementation.
5. Identify missing functionality.
6. Identify incorrect functionality.
7. Fix backend/API integration.
8. Implement Admin authentication/authorization.
9. Implement Dashboard.
10. Implement Search.
11. Implement Clients.
12. Implement Coaches.
13. Implement Sessions.
14. Implement Availability.
15. Implement Leave Requests.
16. Implement Shadow Coverage.
17. Implement Coach Change Requests.
18. Implement Escalations.
19. Implement Renewal Opportunities.
20. Implement Reports.
21. Implement Activity Log.
22. Implement Notifications.
23. Implement Settings/Profile.
24. Test every workflow.
25. Perform final Web → Mobile parity audit.

==================================================
27. FINAL WEB-PARITY AUDIT
==================================================

Before declaring completion, create a complete audit table:

Feature ID
→ Web Function
→ Web Workflow
→ Mobile Screen
→ Mobile Function
→ Backend/API
→ Permission
→ Validation
→ State
→ Tested

Every Admin feature in the PRD MUST be present.

Mark every feature:

IMPLEMENTED
PARTIALLY IMPLEMENTED
MISSING
INCORRECT

Fix all MISSING and INCORRECT items before declaring completion.

==================================================
FINAL OBJECTIVE
==================================================

The finished Admin Mobile Portal must behave as the SAME LEANR Admin Portal as the existing web application.

SAME:
- Functions
- Workflows
- Business rules
- Permissions
- Validations
- Data
- Scheduling
- Coach management
- Client management
- Leave workflow
- Shadow Coverage
- Coach Change workflow
- Escalation workflow
- Renewal workflow
- Reports
- Activity Log
- Notifications
- Settings
- Backend logic

ONLY THE PRESENTATION IS MOBILE.

PRD = FUNCTIONAL TRUTH
APPROVED IMAGE = UI TRUTH
EXISTING VS CODE PROJECT = IMPLEMENTATION BASE

ZERO EXTRA FEATURES.
ZERO REMOVED WEB FEATURES.
ZERO WORKFLOW CHANGES.