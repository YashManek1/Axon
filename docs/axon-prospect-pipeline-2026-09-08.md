# Axon initial prospect pipeline

Prepared September 8, 2026. These are research candidates, not qualified opportunities, customers or confirmed buyers. No messages have been sent.

Primary offer to test: customer-approved diagnostics for vendors of customer-hosted software, with application-specific setup and ongoing maintenance.

**FACT** describes public evidence. **INFERENCE** explains why it may matter. **HYPOTHESIS** is the unknown we need to test. Headcounts below are company/directory snapshots, not independently verified payroll counts; employee bands should only guide outreach priority.

## 1. Plane — first approach

- **Company/industry:** Plane at plane.so; project management software. Do not confuse it with the payroll company at plane.com.
- **Approximate size:** 51–200 employee band in its [Wellfound listing](https://wellfound.com/company/planepowers/people), checked September 2026.
- **FACT — commercial/infrastructure clues:** self-hosted Enterprise offering; Docker-labeled support threads. [Enterprise release](https://plane.so/changelog/release-v2-2-0-enterprise-rollout-enhanced-search-workspace-refinements)
- **FACT — observed workflow:** a February 2026 support reply asks for the installed version and API container logs. [Thread](https://forum.plane.so/t/home-page-error-500/25)
- **INFERENCE:** some context collection could be standardized.
- **HYPOTHESIS:** this repeats often enough in paid support to justify $750/month and a maintained pack.
- **Current solution seen publicly:** documentation, forum replies and customer-supplied logs. Internal tools and private support practices are unknown.
- **What Axon might improve:** one first-response diagnostic packet for a recurrent configuration/connectivity issue. Do not replace the installer or fix application bugs by remote command.
- **Likely buyer:** self-hosted support/engineering owner; approach co-founder/COO Vihar Kurama for routing. Wellfound identifies Vihar and co-founder/CEO Vamsi Kurama.
- **Likely user:** support/platform engineer and customer administrator.
- **Likely objection:** “Those are free community issues; paid customers already have adequate support.”
- **Approach:** professional founder channel or introduction from the public company/community network. Do not post a sales pitch in a user's incident.
- **First validation:** three anonymized paid-customer cases; count repeated requests, active minutes and existing diagnostic tools.

**Draft:**

> Hi Vihar — I saw a Plane self-hosting support thread where version and API logs were requested before investigation could proceed. I'm exploring a narrow Axon workflow that gets approved diagnostic context into the first support reply.
>
> Could you point me to whoever owns support for paying self-hosted customers? I'd value a 20-minute walkthrough of a recent anonymized case before building further. I don't know whether your paid support process has the same friction.

**Status:** Not contacted. Paid-customer frequency, security acceptance and budget unknown.

## 2. Formbricks — small-vendor investigation

- **Company/industry:** Formbricks; surveys and experience management.
- **Approximate size:** 11–50 employee band on [LinkedIn](https://www.linkedin.com/company/formbricks/); directory data may lag.
- **FACT — infrastructure:** a June 2026 issue reports a Docker Compose installation failure associated with database migration ordering. It is **closed**, with a linked fix. [Issue #8224](https://github.com/formbricks/formbricks/issues/8224)
- **FACT — commercial context:** its own careers page describes enterprise customers and self-hosted adoption; identifies Johannes as CEO and Matti as CTO. [Careers](https://formbricks.com/careers)
- **INFERENCE:** application-version and migration-state evidence could help classify some installation incidents.
- **HYPOTHESIS:** paid support has recurring context-collection cost not already handled internally.
- **Current solution seen publicly:** documented installation, issue reports and application fixes. Private diagnostic tools unknown.
- **Potential Axon contribution:** a tested “installation state” packet, maintained for explicitly supported releases. It detects useful facts; it does not perform database repair.
- **Likely buyer:** CTO Matti Nannt / CEO Johannes Dancker; full names appear on the company LinkedIn page.
- **Likely user:** engineer handling self-hosted support.
- **Likely objection:** privacy is part of the product promise; third-party collection or hosting may be unacceptable.
- **Approach:** founder's public professional channel or community introduction.
- **First validation:** whether local-only collection/export is acceptable and whether paid customers generate sufficient repeated cases.

**Draft:**

> Hi Matti — I read the closed Docker Compose migration issue #8224. I'm not proposing another migration tool. I'm investigating whether collecting application version, service health and migration state repeatedly consumes your support engineers' time.
>
> Would you walk me through a recent paid self-hosting support case? The workflow I want to test is customer-run and locally reviewable before any diagnostic data is shared.

**Status:** Not contacted. The cited defect is resolved; recurring need remains a hypothesis.

## 3. Chatwoot — support economics investigation

- **Company/industry:** Chatwoot; customer support software.
- **Approximate size:** YC's current listing reports a team of 12; treat as a directory snapshot. [YC profile](https://www.ycombinator.com/companies/chatwoot)
- **FACT — commercial signal:** sells paid self-hosted support; displayed Premium Support is $19/support agent/month billed annually. Here “agent” means a support user, not a machine process. [Pricing](https://www.chatwoot.com/pricing/self-hosted-plans)
- **FACT — infrastructure/problem clue:** a March 2026 issue reports a Docker deployment where UI message status concealed a failed Sidekiq job. [Issue #13807](https://github.com/chatwoot/chatwoot/issues/13807)
- **INFERENCE:** service/queue information can be useful alongside application symptoms.
- **HYPOTHESIS:** support frequently gathers that information manually, and a maintained packet would save time.
- **Current solution seen publicly:** logs, issue reporting, backend investigation and product fixes.
- **Potential Axon contribution:** bounded worker-health and selected error evidence, without message bodies or customer conversation data.
- **Likely buyer:** CTO/co-founder Sojan Jose or CEO/co-founder Pranav Raj, identified in the YC profile.
- **Likely user:** self-hosted support engineer.
- **Likely objection:** a proper application error message is the correct fix, and a third-party diagnostic product adds no value.
- **Approach:** founder professional channel or company/community introduction.
- **First validation:** classify the last ten self-hosted paid tickets into application bugs, environment problems and repeated information requests. Do not count all bugs as Axon opportunities.

**Draft:**

> Hi Sojan — Chatwoot issue #13807 showed a case where the UI and the background job told different stories. I'm exploring whether a customer-approved packet of worker health, versions and selected errors could reduce repeated context collection in self-hosted support.
>
> Could we review one recent anonymized paid-support case? I want to separate product bugs, which this would not fix, from time spent obtaining evidence.

**Status:** Not contacted. Product bug report is not a purchase signal by itself.

## 4. ToolJet — verification workflow investigation

- **Company/industry:** ToolJet; enterprise application building.
- **Approximate size:** 51–200 employee band in [Wellfound](https://wellfound.com/company/tooljet/people).
- **FACT — infrastructure/workflow:** official PostgreSQL upgrade verification documentation includes deployment-specific checks for Docker/AMI/ECS/Kubernetes. [Guide](https://docs.tooljet.com/docs/setup/postgresql-13-16/aws/verification/)
- **FACT — counterevidence:** ToolJet documents OpenTelemetry-based observability. [Documentation](https://docs.tooljet.com/docs/tj-setup/observability/observability-otel/)
- **INFERENCE:** the repeated portion of the verification procedure is a plausible pack.
- **HYPOTHESIS:** engineers are repeatedly guiding paying customers through it, and internal tooling does not already remove the work.
- **Current solution seen publicly:** procedural documentation, deployment-specific commands and observability integration.
- **Potential Axon contribution:** one customer-approved verification packet for a specific supported installation/version transition. No database upgrade execution.
- **Likely buyer:** CTO/head of engineering or head of customer engineering; confirm the current owner rather than guessing a personal contact.
- **Likely user:** platform/support engineer and customer administrator.
- **Likely objection:** “Our existing observability and upgrade documentation already solve this.”
- **Approach:** professional contact with customer/platform engineering; ask the company to route a research request, not a fake product-sales demo booking.
- **First validation:** review one recently completed customer upgrade and its staff effort.

**Draft:**

> Hi ToolJet team — your PostgreSQL verification guide lays out a concrete sequence of deployment-specific checks. I'm investigating whether customer engineers still need hands-on help collecting those results.
>
> Who owns that part of self-hosted support? I'd like to understand one recent upgrade case and whether a maintained, customer-run verification packet would save meaningful work beyond your existing observability.

**Status:** Not contacted. Evidence is a procedure, not a complaint or measured support burden.

## 5. Budibase — lower-priority counterexample interview

- **Company/industry:** Budibase; internal application and automation software.
- **Approximate size:** current [LinkedIn band](https://www.linkedin.com/company/budibase) is 51–200; other older profiles differ.
- **FACT — workflow and existing solution:** a January 2026 self-hosted upgrade discussion already includes structured environment diagnostics. It was resolved by identifying a client update requirement. [Discussion #17685](https://github.com/Budibase/budibase/discussions/17685)
- **FACT — support context:** publishes community and commercial support scope. [Support policy](https://budibase.com/support/)
- **INFERENCE:** the team can teach us which diagnostics it chose to embed and why.
- **HYPOTHESIS:** any missing value would need to go beyond another generic export.
- **Current solution seen publicly:** built-in diagnostics, support channels and documented tooling.
- **Potential Axon contribution:** only a newly demonstrated repeated workflow gap; none established yet.
- **Likely buyer/user:** customer success/support engineering leader; founders Joe Johnston or Michael Shanks are possible routing contacts, whose current ownership should be confirmed.
- **Likely objection:** “We already built this, and we are an automation product.”
- **Approach:** ask how they chose the boundary between built-in diagnostics and manual support; do not assert unmet demand.
- **First validation:** whether there is any missing workflow they would buy instead of extending their product.

**Status:** Not contacted. Benchmark interview first; low-confidence sales lead.

## 6. Appsmith — research before outreach

- **Company/industry:** Appsmith; internal application building.
- **Approximate size:** company team page says 80+ employees; publication date unspecified. Other directory figures differ, so exact current headcount is unknown. [Team](https://www.appsmith.com/team)
- **FACT — existing practices:** its official self-hosting guide recommends logging and monitoring and offers managed hosting. [Support guide, updated March 2025](https://support.appsmith.com/hc/en-us/articles/19071068830236-Appsmith-Best-Practices-Self-Hosting)
- **INFERENCE:** Appsmith is useful for learning how an established vendor handles customer infrastructure.
- **HYPOTHESIS:** a current recurring gap still exists; none established here. A historical forum result now redirects to the community home page and is excluded as a load-bearing source.
- **Current solution seen publicly:** logging/monitoring guidance, established support and managed hosting; the complete private diagnostic workflow is unknown.
- **Potential Axon contribution:** unknown until recent tickets and existing capabilities are inspected.
- **Likely buyer:** head of support/customer success or CTO Arpit Mohan; official team page identifies CTO and CEO Abhishek Nayak.
- **Likely user:** support engineer.
- **Likely objection:** mature internal tooling, engineering capacity and vendor-review requirements.
- **Approach:** find two recent support-workflow signals first; then request a benchmark interview through professional channels.
- **First validation:** demonstrate a present gap beyond its existing support and managed hosting options.

**Status:** Not contacted. Do not put into an active sales forecast yet.

## 7. Cloudraft — implementer / channel conversation

- **Industry/size:** infrastructure consulting; current headcount not established.
- **FACT:** July 2026 consulting post by Harsh Yadav and Anjul Sahu describes an unnamed client's distribution/support process and an evaluation leading to Replicated. [Article](https://www.cloudraft.io/blog/cloud-native-software-distribution)
- **INFERENCE:** the authors have directly relevant implementation knowledge.
- **HYPOTHESIS:** they see customers whose support needs are narrower than a distribution-platform project, and could refer or subcontract scoped work.
- **Buyer/user:** founder or consulting delivery lead; the authors are appropriate initial research contacts.
- **Likely objection:** Replicated/Distr plus their own services already cover it.
- **Approach:** ask what customer characteristics made the incumbent the right choice and where it would be excessive. Do not claim their client remains unsolved or ask for confidential identities.

**Draft:**

> Hi Harsh and Anjul — your software-distribution article was useful because it explained both the operational pain and why Replicated won. I'm testing a much narrower service: implementing and maintaining customer-approved diagnostic checks for existing installations.
>
> Do you see clients who need that work without a broader distribution project, or is that already well covered? I'd appreciate 20 minutes on the boundary you see in practice.

**Status:** Not contacted. Partner/research role, not a confirmed buyer.

## 8. ShortLoop — historical founder interview only

- **Industry/size now:** dealership phone software; YC listing reports team 8. [Current listing](https://www.ycombinator.com/companies/shortloop/jobs)
- **FACT then:** a co-founder described on-prem release and support coordination in 2023. [Discussion](https://www.reddit.com/r/SaaS/comments/17ar031/challenges_faced_in_providing_onprem_support/)
- **INFERENCE:** a useful experienced-founder interview.
- **HYPOTHESIS:** the founder can explain whether that burden was large enough to fund a tool, and what they actually adopted.
- **Current solution/problem:** unknown for the current business; do not carry the 2023 problem forward.
- **Approach:** identify yourself as researching the historical experience and ask permission for a retrospective interview.

**Status:** Not contacted. Excluded from current customer opportunity count.

## Interview slots to aim for

1. Plane paid-support owner.
2. Plane budget sponsor or customer administrator.
3. Formbricks technical founder.
4. Chatwoot support/engineering owner.
5. ToolJet customer engineering owner.
6. Budibase support/diagnostics owner.
7. A referred administrator of a paying self-hosted installation.
8. A second administrator with a different permission/data policy.
9. Cloudraft implementer.
10. ShortLoop founder retrospective, or another implementer if unavailable.

These are target roles, not booked meetings. Keep account counts separate from interview counts. At least three conversations should include someone who can approve spending.

## Fields to record after every conversation

Account; interviewee and role; evidence links/dates; paid-installation count; eligible cases/month; vendor active minutes; customer active minutes; elapsed waiting; existing tooling; data/access constraints; security approver; budget owner; acceptable pilot price; agreed next action; date; disqualifier; status.

Stages: Research → Evidence-qualified → Conversation → Workflow verified → Security accepted → Paid pilot → Renewal. A meeting or compliment is not a sale.

## A concrete paid-pilot close, only after discovery

> From the cases we reviewed, the repeated work is [specific sequence]. I propose a 30-day, $1,500 pilot covering [one deployment method], [five to eight checks] and [up to three installations]. We will first validate in staging and let the customer review output before sharing.
>
> We will measure your staff time, their administrator time and follow-up requests against the agreed baseline. If it works and you want us to maintain it, the proposed continuation is $750/month for the defined scope. Who needs to approve the access, data flow and pilot purchase?

Do not send this without tailoring the scope to the actual case evidence.
