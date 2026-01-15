# Design Guidelines: Policy Fund Consulting CRM

## Design Approach

**Selected Framework**: Modern SaaS Dashboard Pattern
Drawing inspiration from Linear's precision, Notion's organizational clarity, and enterprise CRM best practices. This utility-focused application prioritizes data clarity, efficient workflows, and professional aesthetics.

---

## Typography System

**Font Stack**: 
- Primary: 'Inter' or 'Pretendard' (Korean optimization) via Google Fonts
- Monospace: 'JetBrains Mono' for customer IDs and numeric data

**Hierarchy**:
- Dashboard Headers: text-2xl / font-semibold
- Section Titles: text-lg / font-semibold
- Data Labels: text-sm / font-medium / uppercase / tracking-wide
- Body/Table Text: text-sm / font-normal
- Helper Text: text-xs / font-normal
- KPI Large Numbers: text-4xl / font-bold / tabular-nums

---

## Layout & Spacing

**Core Spacing Units**: Tailwind 4, 6, 8, 12, 16, 24
- Component padding: p-6 (cards), p-4 (compact elements)
- Section spacing: space-y-6 (vertical stacks)
- Grid gaps: gap-4 (tight), gap-6 (standard), gap-8 (generous)

**Structure**:
- Fixed sidebar: w-64 (left navigation + TODO list)
- Main content: flex-1 with max-w-7xl mx-auto px-8
- Top navigation bar: h-16 with sticky positioning
- Dashboard grid: 3-column layout for KPI widgets (grid-cols-3)

---

## Component Library

### Navigation & Structure
**Top Bar**: 
- User profile (right), team selector (center-right), global search (center)
- Height: h-16, border-b, backdrop-blur-sm with sticky top-0

**Sidebar**:
- Collapsible navigation menu (Dashboard, Customers, Teams, Settings)
- TODO section with badge counts
- Reservation preview (bottom section)
- Active state: full-width accent border-l-4

### Dashboard Components

**Funnel Visualization**:
- Horizontal stepper with numbered circles
- Active step: larger circle with shadow-lg
- Lines connecting steps: border-t-2 with dashed for incomplete
- Status counts in small badges below each step

**KPI Widgets** (3-column grid):
- Card with subtle border, rounded-lg, p-6
- Icon (top-left, size-8)
- Large number display (text-4xl, tabular-nums)
- Label (text-sm, secondary styling)
- Trend indicator (small arrow + percentage, text-xs)
- Bottom helper text explaining calculation logic

**Customer Grid/Table**:
- Sticky header row with sort indicators
- Alternating row styles for readability
- Compact padding (py-3 px-4)
- Column widths: ID (100px), Name (200px), Company (250px), Status (150px), Manager (180px), Actions (120px)
- Inline status badges with rounded-full pills
- Hover row: subtle background change + action buttons reveal
- Customer ID in monospace font

### Interactive Elements

**Buttons**:
- Primary: px-4 py-2, rounded-md, font-medium
- Secondary: border variant with hover state
- Icon buttons: w-10 h-10, rounded-md, centered icon
- Danger actions: distinct treatment for delete operations

**Forms & Inputs**:
- Standard height: h-10
- Border: border rounded-md
- Focus: ring-2 with offset
- Labels: text-sm font-medium mb-2
- Required fields: asterisk indicator
- Date pickers: align with input height

**Modals & Dialogs**:
- Backdrop: backdrop-blur-sm
- Container: max-w-2xl, rounded-xl, shadow-2xl
- Header: pb-4 border-b
- Footer: pt-4 border-t with action buttons (right-aligned)

**Status Badges**:
- Pill shape: rounded-full px-3 py-1
- Text: text-xs font-medium
- Variants for each funnel stage with distinct styling

### Sidebar Components

**TODO List Items**:
- Compact cards: p-3, space-y-2, border-l-4 (priority indicator)
- Checkbox (left), content (center), due date (right, text-xs)
- Assignee avatar (bottom-left, size-6)
- Overdue items: distinct accent treatment

**Reservation Queue**:
- Minimalist list: customer name + time slot
- Today's appointments highlighted
- Scroll container with max-h-64

### Admin Features

**Holiday Calendar**:
- Grid layout showing month view
- Selected holidays: distinct styling
- Add/remove functionality with inline buttons
- Date range picker for bulk addition

**Status Change Logs**:
- Timeline view with left-aligned timestamps
- Change entries: card with from/to status indicators
- User attribution with avatar + name
- Timestamp: text-xs, relative time (e.g., "2 hours ago")

---

## Data Visualization

**Permission-Based Display**:
- Sensitive fields (commission rate): conditional render with lock icon placeholder
- Role badges: small pill next to user names (text-xs, rounded-full)

**Empty States**:
- Centered content with icon (size-16)
- Descriptive message (text-base)
- Primary action button below

**Loading States**:
- Skeleton loaders matching component structure
- Spinner for inline operations (size-5)

---

## Responsive Behavior

**Breakpoints**:
- Mobile (base): Single column, collapsible sidebar becomes drawer
- Tablet (md): 2-column KPI grid, full sidebar
- Desktop (lg): 3-column KPI grid, optimal spacing

**Mobile Adaptations**:
- Top bar: hamburger menu (left), user avatar (right)
- Customer table: card view instead of grid
- Sidebar: slide-over panel with backdrop

---

## Accessibility

- All interactive elements: minimum 44x44px touch target
- Form inputs: associated labels, error messages
- Focus indicators: visible ring-2 on all focusable elements
- ARIA labels for icon-only buttons
- Keyboard navigation: tab order follows visual hierarchy
- Screen reader announcements for status changes

---

## Images

**No hero images required** - this is a data-focused business application.

**Avatar placeholders**: Use initials in circular containers (size-8 standard, size-10 for profiles)

**Icon usage**: Heroicons (outline for navigation, solid for status indicators)