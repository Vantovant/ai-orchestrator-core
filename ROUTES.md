# VantoOS — Route Map

| Route | Module | Description |
|-------|--------|-------------|
| `/` | Dashboard | Executive command center — AI agenda, stats, priorities |
| `/plan` | Plan Hub | Unified planning: Today, Tasks, Reminders, Meetings, Calendar tabs |
| `/plan?tab=tasks` | Plan → Tasks | All tasks with CRUD |
| `/plan?tab=reminders` | Plan → Reminders | All reminders with CRUD |
| `/plan?tab=meetings` | Plan → Meetings | All meetings with CRUD |
| `/plan?tab=calendar` | Plan → Calendar | Day/Week/Month calendar with meetings, reminders, task due dates |
| `/email` | Email | Multi-account Gmail inbox with Superhuman speed layer |
| `/finance` | Finance | Income, expenses, debts, bank imports, AI mentor |
| `/projects` | Projects | Personal project command center with tasks, meetings, notes, links |
| `/travel` | Travel | Trip management with itinerary cards |
| `/shopping` | Shopping | Shopping lists with recurring items |
| `/settings` | Settings | Executive context, work hours, email prefs, data exports |

## Legacy Redirects

| Old Route | Redirects To |
|-----------|-------------|
| `/tasks` | `/plan?tab=tasks` |
| `/reminders` | `/plan?tab=reminders` |
| `/meetings` | `/plan?tab=meetings` |
| `/calendar` | `/plan?tab=calendar` |

## Navigation

- **Desktop**: Sidebar with 8 items (Dashboard, Plan, Email, Finance, Projects, Travel, Shopping, Settings)
- **Mobile**: Bottom nav (Home, Plan, Email, Finance, More) + hamburger menu for full nav
