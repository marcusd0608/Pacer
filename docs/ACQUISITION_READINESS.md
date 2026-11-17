# Making Pacer a company someone would buy

Honest premise: companies like Instructure (Canvas), Kahoot, Pear Deck, Nearpod and GoGuardian buy **users, revenue, distribution or a team**, not a good idea. Features are copied in a quarter. What is hard to copy is below.

## What you can and can't protect
- **Features:** you cannot trademark a feature. A software patent on an "anonymous confusion signal" would be expensive and weak (prior art exists in classroom clickers and polling tools). Don't spend money on it.
- **Name and logo:** you can trademark these, but only after you pick a name nobody conflicts with. "Pacer" is already widely used. Search first; consider renaming now while it is cheap.
- **Code:** copyright applies automatically. Keep the repository private once real customers exist, and keep prompts and scoring logic server-side.
- **Data:** the strongest long-term asset is anonymized, aggregated data on where students get lost, by topic. It only becomes valuable at scale and only if privacy is handled properly.

## What actually creates acquisition value (in order of importance)
1. **Usage.** Weekly active teachers, sessions per teacher per week, students per session, and the percentage who return. This is the number every buyer asks for first.
2. **Retention and lock-in.** A teacher with a library of saved lectures, templates and rosters in Pacer does not leave. Keep building the "system of record" features: saved lectures, post-class packages, exports.
3. **Distribution.** A teacher base that shares Pacer with co-teachers, plus presence in the Google Classroom and Canvas marketplaces.
4. **Revenue.** Even small recurring revenue changes how you are valued: tiny software businesses often sell for a few times their yearly profit on marketplaces that broker them.
5. **Clean company.** Buyers walk away from messy ownership, missing privacy terms or unclear contracts.

## Likely exits, honestly
- **Small asset sale:** a few paying users and some revenue, sold to an individual or small company through a broker marketplace. Realistic in 12 to 24 months if it works. The price is small.
- **Acquihire:** a larger edtech company hires you and Marcus for the product and the usage. Realistic if you have loyal teachers and a clear story.
- **Strategic acquisition by a platform:** needs real scale (thousands of regular teachers and meaningful revenue). A multi-year outcome, not a semester project.

## Due diligence checklist (have this ready before talking to any buyer)
- [ ] Company formed; founder agreement with IP assignment; hackathon and school IP rules checked
- [ ] Clear list of every third party that touches student data (Vercel, Supabase, Anthropic, Google) and their terms
- [ ] Privacy policy, terms, data-deletion process, and a signed student data privacy agreement template
- [ ] Accessibility statement (VPAT) and a recent automated accessibility scan (see `npm run test:a11y`)
- [ ] Security notes: how rooms are protected, how AI use is limited, how data is deleted
- [ ] Metrics export from `usage_daily` for the last 90 days
- [ ] Customer list (even if tiny), quotes, and churn story
- [ ] Automated tests and CI passing, no copied code with unclear licenses

## The practical plan
1. Prove usage with ten teachers (see `docs/OUTREACH_KIT.md`).
2. Add the features that create lock-in (saved lectures, post-class package, exports).
3. Get the first paying customers (see `docs/PRICING.md`).
4. Keep the company clean as you go. Decide at six months whether to grow it or package it for sale.
