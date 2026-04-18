# Rule Scope and Priority Design

## Goal
Ensure rule evaluation respects scope and priority requirements:
- Normal users can view global rule sets but cannot edit them.
- Effective rules for a user = global rule sets + user-owned rule sets.
- When priorities are equal, user rules must be evaluated before global rules.

## Current Context
- Rule evaluation happens in `app/services/alert_engine.py`.
- Rule sets are selected based on `scope` and `owner_user_id`.
- Rules are currently ordered by `priority ASC` then `created_at DESC`.
- Permissions are enforced in `app/routers/rules.py`.

## Scope Behavior
1. **Selection**
   - Select `RuleSet` where `enabled=true`.
   - Effective rule sets for a user:
     - `RuleSet.scope == 'global'`
     - OR `RuleSet.owner_user_id == user_id`

2. **Visibility**
   - `GET /rules/sets` for non-admin includes global + user sets.
   - Global sets returned as read-only in UI; API enforces permissions.

3. **Edit Restrictions**
   - Only admins can create/update/delete global rule sets or rules.
   - Non-admins can only edit their own rule sets and rules.

## Priority Rules
1. **Ordering**
   - Primary: `priority ASC`.
   - Secondary: user scope before global scope when `priority` ties.

2. **Rationale**
   - User-specific intent should override global defaults at the same priority.
   - Global rules still apply when user rules do not match.

3. **Implementation Detail**
   - Add an ordering term with a CASE expression:
     - `CASE WHEN RuleSet.scope = 'user' THEN 0 ELSE 1 END ASC`

## Rule Match Logging
No schema changes required. `RuleMatchLog` already stores:
- `rule_id`, `rule_set_id`, `user_id`

## Error Handling
- If user attempts to edit a global set or rule: `403 Forbidden`.

## Tests
1. **Priority Test**
   - Given one user rule and one global rule with the same `priority`,
     the user rule is evaluated first.

2. **Permission Test**
   - Non-admin cannot update/delete a global rule set or rule.

## Open Questions
None.
