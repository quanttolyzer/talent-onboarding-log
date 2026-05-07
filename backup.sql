--
-- PostgreSQL database dump
--

\restrict Be2sFDdwTp0LhiCeiigTmUApiMGOKub7Tz9OHZQllVBS5af7drOKc2u2sP9BloX

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: talentapp
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.set_updated_at() OWNER TO talentapp;

--
-- Name: sync_group_status(); Type: FUNCTION; Schema: public; Owner: talentapp
--

CREATE FUNCTION public.sync_group_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.is_group_master = true AND OLD.ticket_status <> NEW.ticket_status THEN
    UPDATE tickets
    SET ticket_status = NEW.ticket_status,
        updated_at    = now()
    WHERE group_id = NEW.group_id
      AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.sync_group_status() OWNER TO talentapp;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: action_subaction_rules; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.action_subaction_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action_value text NOT NULL,
    sub_action_value text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.action_subaction_rules OWNER TO talentapp;

--
-- Name: actions; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.actions OWNER TO talentapp;

--
-- Name: assessment_levels; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.assessment_levels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.assessment_levels OWNER TO talentapp;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    changed_by uuid,
    field_name character varying(100) NOT NULL,
    old_value text,
    new_value text,
    changed_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_log OWNER TO talentapp;

--
-- Name: board_column_fields; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.board_column_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    board_column_id uuid NOT NULL,
    field_key text NOT NULL,
    is_required boolean DEFAULT false NOT NULL,
    display_order integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.board_column_fields OWNER TO talentapp;

--
-- Name: board_column_transitions; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.board_column_transitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    from_column_id uuid NOT NULL,
    to_column_id uuid NOT NULL
);


ALTER TABLE public.board_column_transitions OWNER TO talentapp;

--
-- Name: board_columns; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.board_columns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    board_config_id uuid NOT NULL,
    label text NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.board_columns OWNER TO talentapp;

--
-- Name: board_configs; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.board_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_type_id uuid NOT NULL,
    mode text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT board_configs_mode_check CHECK ((mode = ANY (ARRAY['board'::text, 'progress'::text])))
);


ALTER TABLE public.board_configs OWNER TO talentapp;

--
-- Name: board_entries; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.board_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    board_column_id uuid NOT NULL,
    field_values jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.board_entries OWNER TO talentapp;

--
-- Name: board_phases; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.board_phases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    board_config_id uuid NOT NULL,
    label text NOT NULL,
    "position" integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.board_phases OWNER TO talentapp;

--
-- Name: country_companies; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.country_companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label character varying(255) NOT NULL,
    country character varying(100),
    company character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.country_companies OWNER TO talentapp;

--
-- Name: departments; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.departments OWNER TO talentapp;

--
-- Name: hiring_managers; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.hiring_managers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.hiring_managers OWNER TO talentapp;

--
-- Name: management_types; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.management_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.management_types OWNER TO talentapp;

--
-- Name: position_board_batches; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.position_board_batches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    position_id uuid NOT NULL,
    name text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.position_board_batches OWNER TO talentapp;

--
-- Name: position_board_candidates; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.position_board_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.position_board_candidates OWNER TO talentapp;

--
-- Name: position_board_hr_interviews; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.position_board_hr_interviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    position_id uuid NOT NULL,
    count integer NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT position_board_hr_interviews_count_check CHECK ((count > 0))
);


ALTER TABLE public.position_board_hr_interviews OWNER TO talentapp;

--
-- Name: position_board_log; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.position_board_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    position_id uuid NOT NULL,
    actor_id uuid,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.position_board_log OWNER TO talentapp;

--
-- Name: position_board_screenings; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.position_board_screenings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    position_id uuid NOT NULL,
    count integer NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT position_board_screenings_count_check CHECK ((count > 0))
);


ALTER TABLE public.position_board_screenings OWNER TO talentapp;

--
-- Name: position_board_stages; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.position_board_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    position_id uuid NOT NULL,
    candidate_id uuid NOT NULL,
    stage text NOT NULL,
    assessment_level text,
    assessment_result text,
    offer_ticket_number text,
    moved_by uuid,
    moved_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT position_board_stages_stage_check CHECK ((stage = ANY (ARRAY['assessment'::text, 'technical_interview'::text, 'offer'::text, 'hired'::text])))
);


ALTER TABLE public.position_board_stages OWNER TO talentapp;

--
-- Name: positions; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.positions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    management_type text,
    board_status text DEFAULT 'open'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT positions_board_status_check CHECK ((board_status = ANY (ARRAY['open'::text, 'filled'::text])))
);


ALTER TABLE public.positions OWNER TO talentapp;

--
-- Name: sub_actions; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.sub_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action_name text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.sub_actions OWNER TO talentapp;

--
-- Name: ticket_groups; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.ticket_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_code character varying(50) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ticket_groups OWNER TO talentapp;

--
-- Name: ticket_phase_history; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.ticket_phase_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    board_phase_id uuid NOT NULL,
    advanced_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ticket_phase_history OWNER TO talentapp;

--
-- Name: ticket_statuses; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.ticket_statuses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ticket_statuses OWNER TO talentapp;

--
-- Name: ticket_types; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.ticket_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ticket_types OWNER TO talentapp;

--
-- Name: ticket_updates; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.ticket_updates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    submitted_by uuid,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    effective_date date NOT NULL,
    changes jsonb DEFAULT '[]'::jsonb NOT NULL
);


ALTER TABLE public.ticket_updates OWNER TO talentapp;

--
-- Name: tickets; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid,
    is_group_master boolean DEFAULT false NOT NULL,
    task_owner_id uuid,
    entry_date date NOT NULL,
    ticket_number character varying(100) NOT NULL,
    ticket_type text NOT NULL,
    ticket_status text DEFAULT 'On-hold'::text NOT NULL,
    ticket_date date NOT NULL,
    position_id uuid,
    management_type text NOT NULL,
    department_id uuid,
    ultimate_hm_id uuid,
    direct_hm_id uuid,
    country_company_id uuid,
    candidate_count smallint DEFAULT 1 NOT NULL,
    action text,
    sub_action character varying(150),
    remarks text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tickets_candidate_count_check CHECK ((candidate_count > 0))
);


ALTER TABLE public.tickets OWNER TO talentapp;

--
-- Name: user_visibility_grants; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.user_visibility_grants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    viewer_id uuid NOT NULL,
    target_id uuid NOT NULL,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_visibility_grants OWNER TO talentapp;

--
-- Name: users; Type: TABLE; Schema: public; Owner: talentapp
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    date_override_enabled boolean DEFAULT false NOT NULL,
    date_override_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'member'::text, 'viewer'::text])))
);


ALTER TABLE public.users OWNER TO talentapp;

--
-- Data for Name: action_subaction_rules; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.action_subaction_rules (id, action_value, sub_action_value, is_active, created_at) FROM stdin;
\.


--
-- Data for Name: actions; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.actions (id, name, is_active, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: assessment_levels; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.assessment_levels (id, name, is_active, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: audit_log; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.audit_log (id, ticket_id, changed_by, field_name, old_value, new_value, changed_at) FROM stdin;
\.


--
-- Data for Name: board_column_fields; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.board_column_fields (id, board_column_id, field_key, is_required, display_order) FROM stdin;
\.


--
-- Data for Name: board_column_transitions; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.board_column_transitions (id, from_column_id, to_column_id) FROM stdin;
\.


--
-- Data for Name: board_columns; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.board_columns (id, board_config_id, label, "position", created_at) FROM stdin;
\.


--
-- Data for Name: board_configs; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.board_configs (id, ticket_type_id, mode, created_at) FROM stdin;
\.


--
-- Data for Name: board_entries; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.board_entries (id, ticket_id, board_column_id, field_values, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: board_phases; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.board_phases (id, board_config_id, label, "position", created_at) FROM stdin;
\.


--
-- Data for Name: country_companies; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.country_companies (id, label, country, company, is_active, created_at) FROM stdin;
46ff42f3-c645-4566-a6ee-d0c0e8c42d1c	EGYPT - Green Concrete	EGYPT	Green Concrete	t	2026-05-04 18:41:36.239297+00
fe110dfe-2828-4b65-ae40-c34d11b9c473	KSA - Elite	KSA	Elite	t	2026-05-04 18:41:36.24871+00
4d8a8e0e-5c7a-4c78-b5c3-275744f313f6	KSA - Green Concrete	KSA	Green Concrete	t	2026-05-04 18:41:36.250961+00
722cc20b-2d7b-4ec3-8d0c-d65a725116db	KSA - KGS	KSA	KGS	t	2026-05-04 18:41:36.252775+00
c05d35b9-392e-4b40-adfb-b738b6ca5162	Private office KSA	Private office KSA	\N	t	2026-05-04 18:41:36.254525+00
caf89ee4-ffd2-4025-83f7-286c80a8db94	UAE - Cima	UAE	Cima	t	2026-05-04 18:41:36.256011+00
665cb8af-8191-49d5-9633-262b54feac9e	UAE - Emirates Rock	UAE	Emirates Rock	t	2026-05-04 18:41:36.257544+00
6e622c5e-e53e-44e5-b2a9-60bedfacd749	UAE - Green Concrete	UAE	Green Concrete	t	2026-05-04 18:41:36.259453+00
419061fd-389e-4799-ab17-a55aeace9071	UAE - KGS	UAE	KGS	t	2026-05-04 18:41:36.260935+00
1d6f2b10-53ae-44f5-9f87-af39f9262849	UAE - Supply Chain NC	UAE	Supply Chain NC	t	2026-05-04 18:41:36.262294+00
\.


--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.departments (id, name, is_active, created_at) FROM stdin;
f6db0953-e1ca-4cf1-aaf0-eb46ebebee5f	Adminstration	t	2026-05-04 18:41:35.849363+00
54ce14ec-0547-4cdd-8fee-148f27b1d20a	Business Analysis & Internal Control	t	2026-05-04 18:41:35.851144+00
58fd1838-4c75-4bf2-a4da-c7893dd40e3f	CRM Department	t	2026-05-04 18:41:35.852371+00
3403dfca-827b-4b1a-982a-38864523fe6b	Commercial Department	t	2026-05-04 18:41:35.853424+00
936b2b7a-f6aa-4faa-a983-9b70cc43ea77	Commercial Operations Department	t	2026-05-04 18:41:35.854468+00
52d4466b-8b0d-46aa-b946-1134f0694825	Construction Department	t	2026-05-04 18:41:35.855815+00
16223ff8-8324-44fd-8219-ebdcb0d98b14	Crusher Department	t	2026-05-04 18:41:35.857433+00
55c318ab-0db4-406a-a93e-b176649a44ad	Electrical Department	t	2026-05-04 18:41:35.858785+00
82f934c7-7b11-495d-bce0-cca397572081	Elite Admin Department	t	2026-05-04 18:41:35.860219+00
1457f666-479c-4572-8e5d-e3d390c63d7c	Facility Management Department	t	2026-05-04 18:41:35.861525+00
38ad7766-c7c5-4401-9c05-e4907725ae17	Finance Department	t	2026-05-04 18:41:35.86315+00
72660c54-2f54-419c-811d-bb42c17bdfba	GCC Opeartion Department	t	2026-05-04 18:41:35.865009+00
83414bcb-8494-4b63-9d3d-048c774af7e7	Growth Management Department	t	2026-05-04 18:41:35.866357+00
dfc638ba-10e4-422d-9259-d25738ebbf37	Health and Safety Department	t	2026-05-04 18:41:35.867408+00
d22a5bdb-cb69-46d2-b9e7-8d3f12543665	Human Resourse & Admin Department	t	2026-05-04 18:41:35.868444+00
8af1f3ff-ff68-4dc5-a88a-cc11a5397920	Information Technology Department	t	2026-05-04 18:41:35.869388+00
569863a5-e8cd-4d23-869b-01285f4a5211	Internal Audit	t	2026-05-04 18:41:35.87038+00
26668e44-8e5c-4327-8703-8da6e9b08a53	KGS Projects	t	2026-05-04 18:41:35.871414+00
1d0efffa-6aa0-4ff5-a8b9-68576637729d	MEP Department	t	2026-05-04 18:41:35.872491+00
b75b6fcb-adfb-4d6e-93b0-6895f0bb6a29	Maintenance	t	2026-05-04 18:41:35.873422+00
23966012-0fec-43ac-8c42-483d2b897b42	Management	t	2026-05-04 18:41:35.874372+00
dc18feaf-fd86-41be-b1de-2e06696f0e92	Marketing Department	t	2026-05-04 18:41:35.875799+00
e75cce5f-6191-4d33-8093-143708ad848b	Material Controller	t	2026-05-04 18:41:35.877462+00
d3171a10-1c00-4798-9afc-32fff2fc45f3	Material Supply Chain	t	2026-05-04 18:41:35.878863+00
607cdaaa-5205-4896-9009-cfa2867d6536	Office Maintenance	t	2026-05-04 18:41:35.88028+00
0c1ce132-260d-43d9-b34d-7825b1a30ddf	Operation Command Center	t	2026-05-04 18:41:35.881611+00
10083b52-fbd6-4f0d-9ff4-a49f921a0c28	Operation Department	t	2026-05-04 18:41:35.882697+00
a3c58b6e-b48e-4e93-b2af-2d82c26f6b5f	PMV Department	t	2026-05-04 18:41:35.883989+00
3b66fdb6-2162-40a4-99c2-c4f1f6259704	PSBD	t	2026-05-04 18:41:35.885587+00
941e071e-c09b-4291-ac33-d4ec77fa9f57	Payroll Department	t	2026-05-04 18:41:35.886986+00
71bfe1e2-f902-4351-b91d-3c9103025f22	Performance & Excellence Department	t	2026-05-04 18:41:35.888423+00
37a7c56c-48b2-4381-a27d-c7e7d5dc8218	Plant & Maintenance	t	2026-05-04 18:41:35.889744+00
22e182cc-0975-4ab6-8800-823fd1cc53d2	Private Office	t	2026-05-04 18:41:35.891475+00
234579cd-39f0-43e9-b083-e046b3cf43e3	Procurement Department	t	2026-05-04 18:41:35.892891+00
348f357f-1699-4587-9fee-0d3d59fad0f4	Production Department	t	2026-05-04 18:41:35.894084+00
c1575f55-2deb-484c-8112-2f1fb84c09db	Project Management Office	t	2026-05-04 18:41:35.895293+00
c57dd4cb-0b86-44b7-ad44-ff6675a55ad5	Projects Department	t	2026-05-04 18:41:35.89667+00
a386b349-58c2-4727-a780-935cbf1ce61a	Public Relation Depratment	t	2026-05-04 18:41:35.897743+00
ce9da8f7-2291-443d-9bfc-1e10a4dccdb6	Pumping Solution	t	2026-05-04 18:41:35.898935+00
fec40bba-9bda-4d6d-beae-fbcedd69d601	Quality Control	t	2026-05-04 18:41:35.900036+00
7d0880cf-fd39-4435-8269-0649e2d97c93	Raw Material Department	t	2026-05-04 18:41:35.901074+00
67666c4a-7229-4fd3-866c-51523bd61002	Sales Department	t	2026-05-04 18:41:35.902121+00
4305fd11-392a-422e-82a5-ed42a98d6e65	Security Department	t	2026-05-04 18:41:35.90317+00
23d6b146-5fde-496e-aa8a-e2d0ddc023b0	Shared Services Hub	t	2026-05-04 18:41:35.90413+00
7e96b95e-6666-4eb7-9b14-c9dc477bd62c	Stores Department	t	2026-05-04 18:41:35.905194+00
f8ccc919-42df-497c-9e32-cbe1026168d9	Supply Chain	t	2026-05-04 18:41:35.906321+00
ae49541f-98e2-4d8c-ba9c-5af3725d77a7	Talent Acquisition Department	t	2026-05-04 18:41:35.907288+00
e131a357-96d6-4032-951f-a02be85466e8	Technical Department	t	2026-05-04 18:41:35.908468+00
c813c8be-c5ff-48ed-ba8a-344579cf5439	Trade Purchases Procurement	t	2026-05-04 18:41:35.909441+00
1cb97a18-2a94-4317-9d96-a9763244606a	Workshop & Maintenance	t	2026-05-04 18:41:35.91051+00
\.


--
-- Data for Name: hiring_managers; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.hiring_managers (id, name, is_active, created_at) FROM stdin;
4d9d7400-1869-4dd3-b21b-8d33326bcab5	ABDULLAH AHMED ABDULLAH RAGEH	t	2026-05-04 18:41:36.055787+00
8983ccc1-56af-4eb9-8a53-06b67b699b3d	Abdul Mosin	t	2026-05-04 18:41:36.060795+00
0407cb56-4f46-4235-9bde-0d14d4b06282	Adham Abdelhassib	t	2026-05-04 18:41:36.062089+00
bb3041a3-4bad-4f1c-af67-04c65f171fc4	Adham Hedayet	t	2026-05-04 18:41:36.06369+00
110b4d1b-4a54-4559-9b6f-a39ac8a69ce5	Adnan Mansour	t	2026-05-04 18:41:36.064813+00
a6df0e4b-b0a2-4b06-a3c0-73618b87bcb6	Ahmed Albendary	t	2026-05-04 18:41:36.066439+00
133357e9-83ba-4950-bd92-a65e207a3f83	Ahmed Hamdy	t	2026-05-04 18:41:36.06803+00
8712db1b-44de-4596-be8b-b96a87f30ac0	Ahmed Magdy	t	2026-05-04 18:41:36.069327+00
1af3262a-7b31-4955-a4a0-57edd5f3f75c	Ahmed Raouf	t	2026-05-04 18:41:36.070508+00
2c08395c-33f5-43af-9f16-3d746a9bd5b2	Ahmed Wael	t	2026-05-04 18:41:36.071552+00
8a5c3a18-d05c-46b7-9da9-5e53f4357010	Ahsan	t	2026-05-04 18:41:36.072951+00
a883dc06-a768-48b3-a56e-08be72f5b181	Alaa El din	t	2026-05-04 18:41:36.074361+00
0d71b4b4-2f10-41d9-8ccd-a562990410a1	Ali Pasha	t	2026-05-04 18:41:36.075549+00
6465f85b-deb4-4185-a142-2c9074e1f8b5	Ali Saada	t	2026-05-04 18:41:36.076772+00
d2bdefcf-757e-4f85-b474-f45157100911	Amr Elghandour	t	2026-05-04 18:41:36.078012+00
6dc3b81b-f269-4c67-9b62-3c4d10e24f50	Amr el essawi	t	2026-05-04 18:41:36.079214+00
a2a4c63c-6af9-47d2-a599-381e7818fb47	Anil	t	2026-05-04 18:41:36.080528+00
7e6ccb89-8b7f-4d95-9551-3b8efd05a805	Ashraf Lodhi	t	2026-05-04 18:41:36.081823+00
2a993e29-325c-4393-b584-eac3da1d45fb	Assem Adly	t	2026-05-04 18:41:36.08314+00
45100163-0b6d-41e8-8540-6b0cadca129a	Aysha	t	2026-05-04 18:41:36.084369+00
23c844a0-8469-4bef-b46d-b364ca1f365e	Badie Baddoura	t	2026-05-04 18:41:36.08541+00
86bc23f0-c78b-41c5-ad19-ab00dd3e4c62	Bhaskar	t	2026-05-04 18:41:36.086468+00
22d55cec-df84-4772-b0f9-efa23d82bc64	Burhan	t	2026-05-04 18:41:36.087525+00
685b3d5e-7b0f-4b24-b29a-e65dd2f9132e	CCO	t	2026-05-04 18:41:36.088515+00
76f9d35a-ee3d-40b8-8bad-92fb0c2e1d74	CEO	t	2026-05-04 18:41:36.089448+00
0685540b-2209-4b48-b469-f507fde7b8f6	CFO	t	2026-05-04 18:41:36.090417+00
8f35bb3f-6004-4064-9eb7-0ad231c09f04	COO	t	2026-05-04 18:41:36.091393+00
eda2a160-c73c-4107-a15e-819852fb6aa9	Charif Ouamane	t	2026-05-04 18:41:36.092501+00
5df21f31-2d06-4696-bbd0-af13212a68a7	Chris Outayek	t	2026-05-04 18:41:36.093616+00
572c0583-41cf-480f-9102-94cc5a718ae5	Ehab Al-Turaifi	t	2026-05-04 18:41:36.094813+00
6dfbae6a-ac7c-467a-8b76-c49472680a6f	Eslam Awad	t	2026-05-04 18:41:36.095888+00
37369f0a-4b60-44fd-83a2-ba334f60632c	Eslam Mohamed	t	2026-05-04 18:41:36.09696+00
f192e865-047c-4d1e-bfe0-1e00967e982c	Faheem	t	2026-05-04 18:41:36.098081+00
346dd771-78f9-412c-a33c-f6c8e0cbed04	Faten	t	2026-05-04 18:41:36.09905+00
8845fbb1-5057-44b0-86f3-ca3850806d87	GM Cima	t	2026-05-04 18:41:36.100122+00
bb3d3f13-a16d-48d9-8a2d-700eb63e197f	GM Elite	t	2026-05-04 18:41:36.101074+00
5cc9810a-a8bf-4028-b031-44b549723359	GM Green Concrete	t	2026-05-04 18:41:36.102124+00
92c02049-df13-4fe7-93a1-426f08cd50b9	GM KGS	t	2026-05-04 18:41:36.103234+00
49df025c-266c-425a-86fe-67c19ddc3c7f	Gamal Abdelmoonis	t	2026-05-04 18:41:36.104338+00
631153d2-736b-492e-b38c-0aadc232bcc1	General Manager	t	2026-05-04 18:41:36.105419+00
8d777edd-f63f-49b8-ac28-7cf0c2974594	HE Manager	t	2026-05-04 18:41:36.106636+00
aa79e053-2450-4791-a32c-008168b1d516	Hamzeh Nuseir	t	2026-05-04 18:41:36.107869+00
8da3cde9-a5c9-4fcb-bd49-9b6973ec7779	Hassan Raza	t	2026-05-04 18:41:36.109081+00
e07f5459-14c2-4b63-8e54-617b0d60d4f7	Ibrahim Al gamlan	t	2026-05-04 18:41:36.110177+00
0eb9b93a-ad9d-47ec-9db0-5d2dfc1fe9c4	Ihab Raed Eseifan	t	2026-05-04 18:41:36.111184+00
fe5c7fcf-9eec-4489-8fd4-0131ec6b3557	Internal Audit Director	t	2026-05-04 18:41:36.112252+00
cb76eb42-a816-49d1-82fc-d7e07318dcae	Joenel Jr Mendoza	t	2026-05-04 18:41:36.113693+00
651e7cc4-75a0-4e84-8bcd-adb486c1b399	Kareem Wareda	t	2026-05-04 18:41:36.114887+00
25b84d4a-271d-486a-b1a7-292249a66998	Karim Elnaggar	t	2026-05-04 18:41:36.115824+00
5a944b7b-16ed-4e94-9cf7-93bb34c5d152	Karim Ibrahim	t	2026-05-04 18:41:36.116767+00
09ba9d9a-0897-4df6-a3ff-9cf27346f5d7	Kawish Nizami	t	2026-05-04 18:41:36.117761+00
b1312754-d9dc-4cd4-af7f-e55b99105187	Khaled El Dabagh	t	2026-05-04 18:41:36.11887+00
8234458c-8c6c-4e25-bd03-f4d5c95491f6	Lyan Law	t	2026-05-04 18:41:36.119786+00
d1739012-95f1-4a62-9e91-05b0306b25d8	MD KGS	t	2026-05-04 18:41:36.120962+00
56e9a639-c9cd-4efd-9a05-5d94740f7fe6	Marwan Khamis	t	2026-05-04 18:41:36.122259+00
42538f5e-1cbb-4cec-840d-48c6da5e3311	Mena - PMV manager	t	2026-05-04 18:41:36.123215+00
05a50b89-e56d-4788-96d2-7c7e8ee8a8c8	Michael	t	2026-05-04 18:41:36.124343+00
421d578b-d7e9-4c20-82ad-71e04237f085	Mohamed Abdelsalam	t	2026-05-04 18:41:36.125473+00
0370e0c0-1792-4c69-9967-703ad27a629a	Mohamed Hisham Jiffry	t	2026-05-04 18:41:36.126629+00
b0f5822e-6692-4577-87ed-6f24b3483c16	Mohamed Saeed	t	2026-05-04 18:41:36.127637+00
12892067-4fa2-4c3d-8265-9d33e16ba5c1	Mohannad Mouzayen	t	2026-05-04 18:41:36.128694+00
cb18513b-8edd-4cbb-bfd4-4f96b0bd86c8	Mohsin Shah	t	2026-05-04 18:41:36.129714+00
d574e7cb-c8d5-4c0d-93a5-dcb9c21071c9	Mr Reda	t	2026-05-04 18:41:36.130757+00
f2fc3aa3-e034-4609-8aa5-db425234fb66	Mr. Ahmed Hassan	t	2026-05-04 18:41:36.131704+00
b5231c07-b204-49cd-8922-2a73cc7eef07	Mr. Ahmed Magdy / Mr. Hassan	t	2026-05-04 18:41:36.132992+00
41b160c2-3bd6-4336-91e8-bce601da0a23	Mr. Ahmed Tawfik	t	2026-05-04 18:41:36.134026+00
2a7816de-5998-46bd-abbe-32d6edeb619a	Mr. Falah	t	2026-05-04 18:41:36.135112+00
61e38b9d-8a0d-4650-a6bf-bbb1c2e7e082	Mr. Fuad	t	2026-05-04 18:41:36.136479+00
47ee89fb-1f8c-470f-b9cf-00f01a4d6619	Mr. Mohsen	t	2026-05-04 18:41:36.13774+00
78b6f0e5-cc37-4985-81d7-7f99f7719c04	Mr. Omran	t	2026-05-04 18:41:36.138936+00
f5862fa2-fdc6-4fd2-95c9-2a949a0beaed	Mr. Osama	t	2026-05-04 18:41:36.13988+00
0637227e-018f-412b-b20a-e7041526c8b6	Mr. Sultan	t	2026-05-04 18:41:36.140851+00
f98521b8-c9b5-4423-805c-e9812b219f58	Muataz	t	2026-05-04 18:41:36.141891+00
01d017b5-d38c-4a3d-9963-723d9a072243	Naggi Zarifah	t	2026-05-04 18:41:36.142927+00
516364d5-179a-4663-b25a-dd20a59ce8ee	Osama Antar	t	2026-05-04 18:41:36.143806+00
228ac051-8745-4312-a5d9-ab7947e91900	Presales Manager	t	2026-05-04 18:41:36.14487+00
e9547bd7-5d61-4460-ba69-92ae69a4cfd9	Projects Director	t	2026-05-04 18:41:36.146309+00
5b87d8e2-6dc0-45b5-92b8-727ac2981d97	Radim Lakomy	t	2026-05-04 18:41:36.147523+00
94fc30e0-8565-4a5d-98d0-de7fb0923520	Ranjith Kolangada	t	2026-05-04 18:41:36.149018+00
fc756afd-42eb-4415-9b93-4022df6575e6	Ranjith Kumar	t	2026-05-04 18:41:36.150756+00
e60fe97a-9f4e-4e46-b93f-2c5e0684296b	Rivan Adel	t	2026-05-04 18:41:36.152055+00
cadf5a84-23a9-4c6a-9711-699fc1742615	Riyad Alharthi	t	2026-05-04 18:41:36.153265+00
3ece68aa-e74e-473e-863f-247e7cbc2b1a	Salah Dalati	t	2026-05-04 18:41:36.154363+00
693e6e93-aa2e-453f-a7c5-aaff11e07330	Salah dalaty	t	2026-05-04 18:41:36.15545+00
85160e6a-ad13-4a54-83b0-e50cd08ed76f	Sameh Samir	t	2026-05-04 18:41:36.156441+00
4cd470ec-58ac-4f23-b87d-08dc714006b7	Shyam Kumar	t	2026-05-04 18:41:36.15743+00
b0ef72e9-31e7-4b34-ade7-85c49cc03d5f	Syed Ahmed Taha	t	2026-05-04 18:41:36.158388+00
241c3c62-6dd1-4e6c-b769-34425223dc14	Wahid Imam	t	2026-05-04 18:41:36.159445+00
664481ec-c3f9-4cb1-bf67-83ea0d46161a	Wayne	t	2026-05-04 18:41:36.160521+00
\.


--
-- Data for Name: management_types; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.management_types (id, name, is_active, sort_order, created_at) FROM stdin;
8036a031-622e-441a-9514-65e4e5c2164d	Management	t	1	2026-05-04 18:41:36.345203+00
4d05b628-df46-468b-95a9-44ca93008d36	Non - Management	t	2	2026-05-04 18:41:36.359908+00
\.


--
-- Data for Name: position_board_batches; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.position_board_batches (id, position_id, name, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: position_board_candidates; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.position_board_candidates (id, batch_id, name, created_at) FROM stdin;
\.


--
-- Data for Name: position_board_hr_interviews; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.position_board_hr_interviews (id, position_id, count, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: position_board_log; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.position_board_log (id, position_id, actor_id, event_type, payload, created_at) FROM stdin;
\.


--
-- Data for Name: position_board_screenings; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.position_board_screenings (id, position_id, count, created_by, created_at) FROM stdin;
\.


--
-- Data for Name: position_board_stages; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.position_board_stages (id, position_id, candidate_id, stage, assessment_level, assessment_result, offer_ticket_number, moved_by, moved_at) FROM stdin;
\.


--
-- Data for Name: positions; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.positions (id, name, management_type, board_status, is_active, created_at) FROM stdin;
d66da315-fc9a-4ca5-90d8-972c743a3da3	AC Electrician	\N	open	t	2026-05-04 18:41:32.242428+00
66c2d8be-d394-4251-a254-41b9914d7ec0	AI & Data Analytics Internal Audit Specialist	\N	open	t	2026-05-04 18:41:32.253825+00
97341028-2d10-4504-b39c-885514aa0696	Accountant	\N	open	t	2026-05-04 18:41:32.256013+00
45e79472-97b2-4cc9-91aa-07cff31f565e	Administration Assistant	\N	open	t	2026-05-04 18:41:32.258061+00
ff9e5532-3e70-4115-8e85-0ddb3708b555	Archives Clerk	\N	open	t	2026-05-04 18:41:32.259727+00
86550e5a-7531-45b2-b0d2-bf19b54fbeca	Assistant Electrician	\N	open	t	2026-05-04 18:41:32.261412+00
976aca6e-ce99-477a-b5f1-32815a23f66f	Assistant Plant Mechanic	\N	open	t	2026-05-04 18:41:32.262938+00
b8f90ac0-8a7c-4bed-ad8b-17fe53bfb018	Auto Diesel Mechanic	\N	open	t	2026-05-04 18:41:32.264448+00
f06cbc61-6de3-4595-9ef8-ff6eada8a1f6	Auto Elecrtician	\N	open	t	2026-05-04 18:41:32.26601+00
fbeb5625-017c-4d90-96df-fdd4afd4c8a0	Auto Painter	\N	open	t	2026-05-04 18:41:32.267558+00
935dee9e-a2af-482a-babd-7ad422df6e3a	BATCHING PLANT OPERATOR	\N	open	t	2026-05-04 18:41:32.268945+00
403ec402-8381-4a71-ba36-94b8d25b5e88	Benefits & Employee Engagement Supervisor	\N	open	t	2026-05-04 18:41:32.270682+00
6faea3f1-a668-49b1-b8bb-8fda585efc89	Bobcat Operator	\N	open	t	2026-05-04 18:41:32.272331+00
bdbcee70-797e-4b5f-b9d8-9d199ce5991e	Booking Specialist	\N	open	t	2026-05-04 18:41:32.273784+00
1c831b63-254c-4373-9d2a-e4eded062458	Business Analysis & Internal Control Specialist	\N	open	t	2026-05-04 18:41:32.275203+00
0fdcb783-a1e5-4c99-8951-7d0d27843159	Business Analyst Leader	\N	open	t	2026-05-04 18:41:32.276734+00
049c00bf-d8f0-49d2-ad8d-2595cebb639e	Business Development Manager	\N	open	t	2026-05-04 18:41:32.278182+00
8a6fbba4-aff4-4d0a-a7f7-69e767b3ab86	Business Support Specialist	\N	open	t	2026-05-04 18:41:32.27952+00
95f4009e-8f6a-4ef6-a9ce-d9173e1a4ac1	Butler	\N	open	t	2026-05-04 18:41:32.28067+00
649fbab9-3f55-4e64-bdcc-2ed37151e671	CEO Advisor	\N	open	t	2026-05-04 18:41:32.282151+00
a5335052-4732-45b3-a4ab-96493d9e4427	CFO	\N	open	t	2026-05-04 18:41:32.283563+00
03fd0d2d-2365-4853-9d9c-271e127ab416	COO	\N	open	t	2026-05-04 18:41:32.285149+00
f7933de5-0579-4957-95b9-225c82e6fff8	Call Center Agent	\N	open	t	2026-05-04 18:41:32.286673+00
eb1ea15a-2930-40d2-bf6a-e8ab0da6b192	Camp Assistant	\N	open	t	2026-05-04 18:41:32.288109+00
6d4e883b-7172-4601-991a-c7a0c989c7f2	Camp Supervisor	\N	open	t	2026-05-04 18:41:32.289262+00
dd07fa44-a518-4480-acc0-351c3568868d	Carpenter	\N	open	t	2026-05-04 18:41:32.29051+00
8180b44b-84dd-4685-b5d0-98175c0b5875	Chef	\N	open	t	2026-05-04 18:41:32.291603+00
108e0c1d-5ee0-4780-8dda-355251011ce4	Chief Accountant	\N	open	t	2026-05-04 18:41:32.292645+00
d993e8d5-0b5d-42f1-8d3f-2f7855615ece	Chief Performance & Excellence Officer	\N	open	t	2026-05-04 18:41:32.29413+00
4f273e66-5b11-41bb-aa59-95edb13ec8e1	Chiller Technician	\N	open	t	2026-05-04 18:41:32.295437+00
49a8f7f2-f8ef-49fd-bfef-aca8bc49406e	Cleaner	\N	open	t	2026-05-04 18:41:32.296661+00
b698ffcf-ba8c-47c9-99e4-a94747e82470	Collection Officer	\N	open	t	2026-05-04 18:41:32.29848+00
552172b3-d441-4f83-9841-2718d69605f0	Commercial & BD Manager	\N	open	t	2026-05-04 18:41:32.299841+00
bf6186fe-374d-46ef-b990-a4fe3daefa01	Commercial Busniess Director	\N	open	t	2026-05-04 18:41:32.301516+00
1ae3fed4-5929-4f61-bd47-9f88cad70073	Commercial Coordinator	\N	open	t	2026-05-04 18:41:32.302945+00
29756b30-be97-41b6-8448-19b43537155d	Commercial Director	\N	open	t	2026-05-04 18:41:32.304272+00
2f5ccd1d-2396-4cca-b97f-a5dad9998b9a	Commercial Engagement Specialist	\N	open	t	2026-05-04 18:41:32.305447+00
0d9a20a5-d46c-4fb5-8752-a8dd151f51c7	Commercial Manager	\N	open	t	2026-05-04 18:41:32.306671+00
74af3a70-e877-4983-b596-4d59b80334d4	Commercial Operations Director	\N	open	t	2026-05-04 18:41:32.30814+00
41c23ae7-e39b-4e75-b541-13fcd1984708	Commercial Operations Manager	\N	open	t	2026-05-04 18:41:32.309271+00
59eefd6e-5841-4f01-bad6-cc6d06d05523	Commercial Support Leader	\N	open	t	2026-05-04 18:41:32.310379+00
157cbad6-39dd-4ba0-83b8-871733d65a0f	Commercial Support Specialist	\N	open	t	2026-05-04 18:41:32.311418+00
6f810119-7a0e-4966-b4d5-1ae457ae2de9	Concrete Delivery Manager	\N	open	t	2026-05-04 18:41:32.313056+00
ac10d32d-1174-447b-aba5-e1abecde5a57	Concrete Pump Driver	\N	open	t	2026-05-04 18:41:32.314218+00
1562b142-937a-4ad1-b0c2-5815c2017b73	Concrete Pump Operator	\N	open	t	2026-05-04 18:41:32.315294+00
57e1523e-e94d-4d61-9359-08d5ae7ea22d	Concrete Pumping Manager	\N	open	t	2026-05-04 18:41:32.316454+00
d3583f7b-f7d0-48ed-8871-431801a75593	Contracts Manager	\N	open	t	2026-05-04 18:41:32.317763+00
6fa2d886-c19c-4159-9d57-bb50fc2a7f21	Coordinator - Administrator	\N	open	t	2026-05-04 18:41:32.318797+00
fb3c7da4-543b-431f-872c-da59aeab16ba	Cost Controller	\N	open	t	2026-05-04 18:41:32.32+00
068d82cd-ac9d-4ae1-8865-d4584f6d461d	Credit Management Specialist	\N	open	t	2026-05-04 18:41:32.321099+00
70a74642-3c2b-4c7c-af48-e653e133634f	Crusher & Logistics Director	\N	open	t	2026-05-04 18:41:32.322263+00
6d2f22b0-7b98-4900-b204-c4471583035c	Crusher General Manager	\N	open	t	2026-05-04 18:41:32.3234+00
12b3ed07-8b29-4d00-ac4c-3aa2ff78acb6	Crusher Helper	\N	open	t	2026-05-04 18:41:32.324355+00
2e665601-8044-4037-988c-cde86e531c72	Crusher Mechanic	\N	open	t	2026-05-04 18:41:32.325279+00
65811f82-1512-4931-84e9-694ebce3059d	Customer Service Agent	\N	open	t	2026-05-04 18:41:32.326794+00
bb2fc11f-f5ae-49a0-9ca1-ae461595c988	Cyber Security	\N	open	t	2026-05-04 18:41:32.328036+00
32664773-309f-4735-b027-662cdbb94b23	DCO (Drive Cum Operator)	\N	open	t	2026-05-04 18:41:32.329047+00
d6b01554-7e7c-4c75-9845-092986fc4caf	DIESEL MECHANIC	\N	open	t	2026-05-04 18:41:32.330172+00
71451657-373f-449a-986d-bed7ab310d22	Data Collector	\N	open	t	2026-05-04 18:41:32.331255+00
4cea204c-63f6-4406-8a27-f89d420e9def	Data Entry Operator	\N	open	t	2026-05-04 18:41:32.332225+00
bce29dda-1147-4111-bce2-f36b44755769	Data Monitor Engineer	\N	open	t	2026-05-04 18:41:32.333186+00
19111a25-79f0-420f-a863-19ffbfac0a28	Delivery Docket Controller	\N	open	t	2026-05-04 18:41:32.33416+00
910c872b-accc-424f-8995-70010ddf4140	Delivery Manager	\N	open	t	2026-05-04 18:41:32.335191+00
b851ed25-0f05-4eeb-a6d4-14bc3cecf153	Delivery Planner	\N	open	t	2026-05-04 18:41:32.33624+00
49eb13ad-2295-4ad5-809e-66af828d8959	Denter	\N	open	t	2026-05-04 18:41:32.337273+00
df36f54e-9c02-4e0b-a5f1-25c1ddcd7057	Diesel Filler	\N	open	t	2026-05-04 18:41:32.33842+00
8a76daf5-7f24-486c-9e62-066f426252bf	Digtal Marketing & Design Specialist	\N	open	t	2026-05-04 18:41:32.33949+00
d1149f92-c92d-4404-ab01-1089ccd7843c	Dispatcher	\N	open	t	2026-05-04 18:41:32.340535+00
d9782197-348c-4e8d-a4cd-239c73ab732d	Document Controller	\N	open	t	2026-05-04 18:41:32.342022+00
ba8de49f-1df1-46cf-8749-c0961208d109	Electrician	\N	open	t	2026-05-04 18:41:32.343339+00
461293f7-7550-4880-8317-991299983aac	Emiratisation	\N	open	t	2026-05-04 18:41:32.347077+00
82232c20-2eac-4f9d-9bb3-f8a983b72c1a	Engineer	\N	open	t	2026-05-04 18:41:32.348473+00
89dfea41-a71b-4236-81b9-c4865396999b	Environmental Engineer	\N	open	t	2026-05-04 18:41:32.34977+00
b6387c7e-f2c9-4daa-a78b-f3775145240d	Environmental Leader	\N	open	t	2026-05-04 18:41:32.351056+00
0a048a2d-a496-4728-8f74-0d3a1b44d47d	Executive Assistant	\N	open	t	2026-05-04 18:41:32.352042+00
09d3bba1-a9bf-46fa-9c2b-a063fcdcfce7	Executive Secretary	\N	open	t	2026-05-04 18:41:32.352983+00
35d08346-2701-4bcf-8099-3d29004686a7	FP&A Manager	\N	open	t	2026-05-04 18:41:32.354131+00
b1366e4b-a681-448d-b6af-3cba314a854c	FP&A Team Leader	\N	open	t	2026-05-04 18:41:32.355381+00
fa411015-0b79-4600-afd1-31ac634f84cf	Finance Director	\N	open	t	2026-05-04 18:41:32.356664+00
a2676447-c5cd-4c4e-bd9b-3f05a003ec25	Finance Excellence and Internal Controls Manager	\N	open	t	2026-05-04 18:41:32.357963+00
e55b968f-9a73-41f3-bdf0-1170778676b1	Finance Manager	\N	open	t	2026-05-04 18:41:32.359082+00
d2707fbb-4862-47ad-badd-8c8df3183f90	Finance Operations Manager	\N	open	t	2026-05-04 18:41:32.360213+00
8407d613-f496-4278-9c76-d14d1f1b03bc	Financial Analyst	\N	open	t	2026-05-04 18:41:32.36131+00
81e395a6-0ca9-4e91-af31-8e73712caa2d	Financial Controller	\N	open	t	2026-05-04 18:41:32.362364+00
615e8dba-9a73-429d-be89-15aee1a0e3e8	Fleet Coordinator	\N	open	t	2026-05-04 18:41:32.36386+00
e3235f02-5fc8-4b97-9192-6cb1e91a8b73	Fleet Foreman	\N	open	t	2026-05-04 18:41:32.364999+00
fa6dd149-43a1-47f9-a0f8-bab16bea4b63	Formen Civil	\N	open	t	2026-05-04 18:41:32.366068+00
584f0051-2a56-411a-8ac8-46b14267218a	Furniture Carpenter	\N	open	t	2026-05-04 18:41:32.36716+00
8b990926-8775-4328-9768-a4fc47519042	GL Accountant	\N	open	t	2026-05-04 18:41:32.368484+00
82ada9de-7a4b-4e35-9a10-913b0c729abb	General Manager	\N	open	t	2026-05-04 18:41:32.369752+00
ae1cca50-08c7-4b24-b241-d9c7c25669a9	Governance Risk and Control Specialist	\N	open	t	2026-05-04 18:41:32.370927+00
3cfeb3cc-25ff-4b81-b905-1371fb2022ec	Government Relations Manager	\N	open	t	2026-05-04 18:41:32.372006+00
6979a965-9f62-4418-9a0d-f7348c456469	Graphic Designer	\N	open	t	2026-05-04 18:41:32.373006+00
c90d5cea-2d46-43ce-b9ed-1cfe70d8e07c	Graphic Designer/Marketing Coordinator	\N	open	t	2026-05-04 18:41:32.374121+00
cfe10dd6-dd52-4767-8ede-f4fbe769f8d5	Group CFO	\N	open	t	2026-05-04 18:41:32.375438+00
a8a78698-1077-4a0e-b8b8-983fd55e12ed	Group Compensation and Benefits Manager	\N	open	t	2026-05-04 18:41:32.376497+00
d0859548-74e5-482d-bd9f-ddbf8eedb374	Group Contracts Manager	\N	open	t	2026-05-04 18:41:32.377977+00
9db48d1b-be77-4372-bd28-2f997df2355e	Group IT Director	\N	open	t	2026-05-04 18:41:32.379247+00
1b02d2e7-0ac9-4868-a461-b42abd1efc75	Group Internal Audit Manager	\N	open	t	2026-05-04 18:41:32.380344+00
4ddffb84-890e-491c-bb29-b943e21ae766	Group Onboarding Specialist	\N	open	t	2026-05-04 18:41:32.381401+00
d58d449e-5fe5-4259-8e9c-8f4f77b9c7e2	Group Payroll Manager	\N	open	t	2026-05-04 18:41:32.382984+00
24f0ad54-b6d7-450e-a316-b6096aaed66f	Group Sr. Payroll Specialist	\N	open	t	2026-05-04 18:41:32.38458+00
ea038d1e-dfc7-43f7-a00f-bbc299e1efaf	Group Sr. Talent Acquisition Specialist	\N	open	t	2026-05-04 18:41:32.385909+00
e30b93ba-8c74-4e1c-a971-067eb675b902	Group Talent Acquisition Specialist	\N	open	t	2026-05-04 18:41:32.387093+00
a483bcc7-4be4-43fd-acc8-0f798ae8fb7a	Group Treasury Manager	\N	open	t	2026-05-04 18:41:32.38852+00
ca26e87b-a5dd-4a4c-9d48-576ffb20bf69	HR & Admin Manager	\N	open	t	2026-05-04 18:41:32.389989+00
bdeb24e0-d304-41e2-90c3-928757789e40	HR Coordinator	\N	open	t	2026-05-04 18:41:32.391101+00
49b7f317-8452-443c-b981-58e141eca2d7	HR Generalist	\N	open	t	2026-05-04 18:41:32.392335+00
0686258a-5397-472f-9b04-415019848ab9	HR Manager	\N	open	t	2026-05-04 18:41:32.393392+00
06d68cbd-233e-4c58-a60c-d6bb2f8659dd	HSE Officer	\N	open	t	2026-05-04 18:41:32.394549+00
e414136d-891e-4407-983d-59137ba162fe	Happiness Coordinator	\N	open	t	2026-05-04 18:41:32.395714+00
aa79a503-e884-47ac-b83d-50c7d5f7ad6b	Head of Butler	\N	open	t	2026-05-04 18:41:32.397181+00
a0f2177b-5a4f-4dd8-8b5c-0c273dfc1f80	Head of Finance	\N	open	t	2026-05-04 18:41:32.398428+00
de02684d-8fa7-4890-8bfd-d2507eaf0588	Head of Operations	\N	open	t	2026-05-04 18:41:32.399549+00
f12e9cee-282c-4c3d-b029-d565780e5937	Head of Security	\N	open	t	2026-05-04 18:41:32.4006+00
b483a365-a491-4ee4-8fef-1f5bf0c872fc	Healthy and Safety Manager / HSE Manager	\N	open	t	2026-05-04 18:41:32.401781+00
f3ac7759-4601-43dc-ac25-2990389a98bc	Helper	\N	open	t	2026-05-04 18:41:32.402896+00
c00fdbf8-8660-48bb-b339-02d890c53758	Helper - Production	\N	open	t	2026-05-04 18:41:32.403992+00
eea2d84e-d55f-4e88-82e9-a67b30d434ae	Housekeeper	\N	open	t	2026-05-04 18:41:32.404944+00
5590b503-1674-4ffa-98a0-d3882083d9ec	Human Capital Officer	\N	open	t	2026-05-04 18:41:32.405946+00
6681c7f5-7aa5-442a-a12c-c082c973c000	Hydrauli Mechanic	\N	open	t	2026-05-04 18:41:32.407037+00
0f13846a-252d-4f9f-b756-b74367b33de6	IPO Manager	\N	open	t	2026-05-04 18:41:32.408352+00
fb9aab22-7d31-4818-a03e-77706c5f37aa	IT Internal Audit Manager	\N	open	t	2026-05-04 18:41:32.409619+00
9d96c04d-01ef-4316-964d-6bdf24e7d28f	Ice Plant Operator	\N	open	t	2026-05-04 18:41:32.410957+00
aea9b49f-47e5-44d7-8f39-fea62c0388d8	Indian Chef	\N	open	t	2026-05-04 18:41:32.412374+00
72412abb-eccb-4b03-b8a0-87ac483542cb	Insurance Officer	\N	open	t	2026-05-04 18:41:32.413978+00
a36337af-f40d-41a6-86a0-825a2d6448f3	Insurance Specialist	\N	open	t	2026-05-04 18:41:32.415079+00
4944f0bf-ad05-4d1e-a3c3-036ef34fc478	Internal Audit Manager	\N	open	t	2026-05-04 18:41:32.416294+00
881d6938-36a7-459a-b47a-726f29106cd9	Internal Auditor	\N	open	t	2026-05-04 18:41:32.417411+00
89ccd644-befc-4b09-9f71-9565fd1438bb	Investment Analyst	\N	open	t	2026-05-04 18:41:32.418525+00
5e3771cb-0811-46e5-a4d7-3d90a1eca356	Investment Specialist	\N	open	t	2026-05-04 18:41:32.419605+00
799314f2-a228-42bb-a796-39d02a9c5754	Investment Team Coordinator/Junior Analyst	\N	open	t	2026-05-04 18:41:32.420733+00
8753dc4d-e410-4377-9b28-fb5537821a4f	Junior Accountant	\N	open	t	2026-05-04 18:41:32.421878+00
041aeb08-5019-4fd2-af07-22e1d9f14732	Junior Internal Auditor	\N	open	t	2026-05-04 18:41:32.423091+00
cdde365f-d83e-4fc8-a7fa-e2e50aa1fc27	LV Driver	\N	open	t	2026-05-04 18:41:32.424633+00
c8af06fc-d5fd-44d6-bba9-57b117976cc0	Lab Supervisor	\N	open	t	2026-05-04 18:41:32.426075+00
73e80473-d33a-4622-ac15-d32e95902b6b	Lab Technician	\N	open	t	2026-05-04 18:41:32.427349+00
7b8d1647-c13a-408a-b06b-c2fef9adb2e5	Leasing Admin	\N	open	t	2026-05-04 18:41:32.428524+00
ea8bed76-3cd5-4cb9-ad4a-68ce7814e83c	Leasing Coordinator	\N	open	t	2026-05-04 18:41:32.429524+00
110f911f-3c72-4811-9843-e6b6d62ebd44	Logistics Coordinator	\N	open	t	2026-05-04 18:41:32.430597+00
8575522d-d85a-4e2e-b245-8d7d170e70a3	Logistics Director	\N	open	t	2026-05-04 18:41:32.431567+00
70b46e6c-af72-4807-a2b8-520efaf8a61d	Lube man	\N	open	t	2026-05-04 18:41:32.43266+00
c19be057-d6f4-4cd7-917b-d297f9deae3a	MD Secretary	\N	open	t	2026-05-04 18:41:32.433808+00
987b3183-7261-439c-9c2a-fc134adb8b01	MEP Engineer	\N	open	t	2026-05-04 18:41:32.434802+00
755a63b6-1505-4e04-ba03-1a8a5224b7f9	MEP Forman	\N	open	t	2026-05-04 18:41:32.435761+00
00531dc3-0f34-40b5-9b54-10bc39236b3d	MEP Manager	\N	open	t	2026-05-04 18:41:32.436689+00
8ea59b4f-33e4-429e-a294-f634594627d1	MESON	\N	open	t	2026-05-04 18:41:32.437809+00
3819a69e-59fa-4408-b8bd-d3eb703ce726	Maintenance Engineer	\N	open	t	2026-05-04 18:41:32.439185+00
34c602ce-2716-44ba-b17a-6355d0dc75bd	Maintenance Supervisor	\N	open	t	2026-05-04 18:41:32.440436+00
9a609d91-0e15-418c-8778-6550b3bd880f	Material Controller	\N	open	t	2026-05-04 18:41:32.441633+00
fe1e9c18-2873-4679-b3e9-77b747af9ad7	Material Coordinator	\N	open	t	2026-05-04 18:41:32.442765+00
135e8e4d-5555-4445-b6ea-dbb0b87882a0	Material Receiver	\N	open	t	2026-05-04 18:41:32.443987+00
f58c4e7f-5a70-4332-a87d-a5445f8ce6af	Mechanic Technician	\N	open	t	2026-05-04 18:41:32.445043+00
444daebc-a1ad-4890-93ec-976a010f8ebf	Mining Engineer	\N	open	t	2026-05-04 18:41:32.446055+00
fcb46ac7-6ae9-42f7-b0f5-fbbb5e32c0bc	Mixer Driver	\N	open	t	2026-05-04 18:41:32.447054+00
90164a6e-bcbf-4d1c-b475-6cd9ef788651	Mobile App Developer	\N	open	t	2026-05-04 18:41:32.448042+00
062b6213-47bd-4e32-9651-4b9c978fa261	Mosque Muezzine	\N	open	t	2026-05-04 18:41:32.448962+00
ff2d7d17-fb7d-4d6c-8f0a-1705e9dddc53	Office Attendant	\N	open	t	2026-05-04 18:41:32.450086+00
f528c5c3-74ee-414e-b678-9759613899ff	Office Boy	\N	open	t	2026-05-04 18:41:32.451517+00
3d19bfc2-028f-44f6-9cf2-bfee0f8525ec	Operation Manager	\N	open	t	2026-05-04 18:41:32.4541+00
660493a1-3f09-4072-b924-32fc2a6463b8	Operations Director	\N	open	t	2026-05-04 18:41:32.457216+00
8293fc02-3c63-492f-b180-2ccb55c7e77a	Operations Support Partner	\N	open	t	2026-05-04 18:41:32.459337+00
02fe30f4-7be2-4737-8adb-292ab120bc32	PMV Adminstrator	\N	open	t	2026-05-04 18:41:32.461166+00
9bd1e43c-f067-43c1-8faa-39dc6f4dcacf	PMV Director	\N	open	t	2026-05-04 18:41:32.462579+00
6e4fe6b5-d0c6-4fec-b4b9-2c1229d814f8	PMV Engineer	\N	open	t	2026-05-04 18:41:32.464206+00
837cf0d1-1f04-4ba7-adb0-6b5bd019e12a	PMV Engineer - Workshop	\N	open	t	2026-05-04 18:41:32.466203+00
750743de-6cca-4861-bde9-f3d053f15e3e	PMV Planning Engineer	\N	open	t	2026-05-04 18:41:32.468052+00
876b3bb1-1803-4f96-a444-cdaf71004c7f	PRO Typist	\N	open	t	2026-05-04 18:41:32.469347+00
13778c5d-6328-4f7b-b624-f0575a3f6cd4	Performance & Digital Transformation Specialist	\N	open	t	2026-05-04 18:41:32.47069+00
e7f24b29-e244-4e59-8706-27fdbcc15040	Performance Lead	\N	open	t	2026-05-04 18:41:32.471954+00
90419e57-99ff-41a9-8164-2731d4e08661	Performance Specialist	\N	open	t	2026-05-04 18:41:32.473116+00
388daf6b-1fb0-4e56-8097-9be208408961	Personal Trainer	\N	open	t	2026-05-04 18:41:32.474269+00
a67c2082-04cb-4db1-a218-b6bbdfb0574e	Philipinne Chef	\N	open	t	2026-05-04 18:41:32.475483+00
50ad1c6e-1b90-44c5-a5a7-398069d6d7f9	Pipline formen	\N	open	t	2026-05-04 18:41:32.476797+00
c76ecafa-1850-4f65-b438-0153a5711d61	Placing Boom Engineer	\N	open	t	2026-05-04 18:41:32.478016+00
43546a16-e6f1-4b63-b800-2398003a6367	Placing Boom Operator	\N	open	t	2026-05-04 18:41:32.479176+00
495e9aad-a4a9-4f01-8acb-6035b64dc22f	Planning & Market Analyst	\N	open	t	2026-05-04 18:41:32.480555+00
cc364492-70e4-44da-a936-d8ca4684c92c	Plant Electrician	\N	open	t	2026-05-04 18:41:32.481909+00
1a0c8036-afa9-4fa1-b1be-b82b4de5c325	Plant Helper	\N	open	t	2026-05-04 18:41:32.483133+00
5dcb12ef-151c-488c-9908-48d7fbe39788	Plant Maint. Supervisor	\N	open	t	2026-05-04 18:41:32.484278+00
5443049d-7972-41bc-ae60-346084456cbe	Plant Maintenance Area Manager	\N	open	t	2026-05-04 18:41:32.485274+00
401b232f-6ede-4c1e-98de-aaf27469f5b9	Plant Maintenance Engineer	\N	open	t	2026-05-04 18:41:32.486253+00
41b78ac4-5a7b-4a6d-a890-f6d3f6218c9e	Plant Mechanic	\N	open	t	2026-05-04 18:41:32.487368+00
3ca74abc-e8d4-457e-a76e-e50a304484e4	Plant Operator	\N	open	t	2026-05-04 18:41:32.488492+00
123ed1f9-929b-4674-8c9e-7d5be3b32098	Plant Supervisor	\N	open	t	2026-05-04 18:41:32.489692+00
a40ec9ef-a1cf-4147-8870-a838890d81f0	Plant Technician	\N	open	t	2026-05-04 18:41:32.49079+00
73695377-d944-4175-b462-5627f145ca0a	Plumber	\N	open	t	2026-05-04 18:41:32.491869+00
9de3e1ef-628f-4ed7-a9f4-f4b1574d1e55	Pre Sales Manager	\N	open	t	2026-05-04 18:41:32.49291+00
c204dfff-d0c5-466c-a5ca-aaef274c6ee6	Presales Leader	\N	open	t	2026-05-04 18:41:32.494168+00
f6880876-f9ce-44e5-a563-cdb8f4c00982	Private Driver	\N	open	t	2026-05-04 18:41:32.495349+00
f5986992-4aa7-4dc9-a9c4-e190df4ca291	Procurement Director	\N	open	t	2026-05-04 18:41:32.496455+00
950e2802-bb6e-48e1-b594-f3c56df69f14	Procurement Manager	\N	open	t	2026-05-04 18:41:32.49749+00
7a18bb81-04fd-439c-ac32-b32d67b4a782	Procurement Officer	\N	open	t	2026-05-04 18:41:32.49863+00
00aa7983-2cd4-4b90-8f0e-f09876b1d1fa	Procurement Section Head	\N	open	t	2026-05-04 18:41:32.499734+00
f2e563f7-4d9c-471c-a9d2-8f5c2416bd2f	Procurement Team Lead - Trade Purchases	\N	open	t	2026-05-04 18:41:32.500804+00
87d1e4a6-c9ad-4e6d-8e76-e1e29fc19154	Procurment & Logitics Manager	\N	open	t	2026-05-04 18:41:32.502803+00
4fa33aae-a36a-48c6-ac3d-a0fd5b193a7f	Production Engineer	\N	open	t	2026-05-04 18:41:32.504239+00
e031cf53-6fa3-4481-96cf-9d69001a4fe3	Production Supervisor	\N	open	t	2026-05-04 18:41:32.505486+00
b1ce782c-5f07-4cf2-a132-a49edf3a153e	Project Director	\N	open	t	2026-05-04 18:41:32.506903+00
42ca0812-80a5-499b-94ad-50bd8515d084	Projects Manager	\N	open	t	2026-05-04 18:41:32.508686+00
2afd1e6b-7cea-4c2b-94d6-e03f53bf939f	Public Relations Officer	\N	open	t	2026-05-04 18:41:32.510101+00
4bb8e665-6f66-4834-8b42-47ae6f2915f4	Pump Helper	\N	open	t	2026-05-04 18:41:32.511264+00
1ab7634f-dadf-463e-b591-048bdfab9838	Pump Operator	\N	open	t	2026-05-04 18:41:32.512498+00
7e67891d-a8aa-4a13-a069-b320da42ec52	QC Admin	\N	open	t	2026-05-04 18:41:32.514044+00
6167d218-16d1-4f81-adc1-ade6cc3211b3	QC Engineer	\N	open	t	2026-05-04 18:41:32.515481+00
7e004220-caa8-4446-aad0-58b4e39b1566	QC Supervisor	\N	open	t	2026-05-04 18:41:32.5166+00
9eed8c75-dd1f-434b-ae4e-c2e4c579ef0a	QHSE Manager	\N	open	t	2026-05-04 18:41:32.51778+00
684d20df-43bf-4630-825e-040f06e6f297	Quality Control Supervisor	\N	open	t	2026-05-04 18:41:32.519296+00
b2b16acd-0a8e-4756-a2fd-998b1f1a1f77	Quotation Specialist	\N	open	t	2026-05-04 18:41:32.520558+00
8d55484e-456a-4b15-aa32-3e2046426513	Raw Material Procurement	\N	open	t	2026-05-04 18:41:32.522089+00
ae8a80a6-004f-458e-9041-001555915354	Raw Material Procurement Team Lead	\N	open	t	2026-05-04 18:41:32.523487+00
bbf7f915-b3e4-4aa0-ab6d-aae5fc91f09d	Receptionist	\N	open	t	2026-05-04 18:41:32.524778+00
f1860709-991c-4aa2-a714-8c1b8b8c9971	Rigger	\N	open	t	2026-05-04 18:41:32.526573+00
3908113f-2f2b-430e-98a4-f01832dc59ee	SME’s Manager	\N	open	t	2026-05-04 18:41:32.528171+00
8c3398e0-22e0-4362-9e63-d1f1b9b400cd	STORE KEEPER	\N	open	t	2026-05-04 18:41:32.529758+00
44c42fc4-a602-4e95-89dc-bb33ba495213	Safety Officer	\N	open	t	2026-05-04 18:41:32.53133+00
fbb5f27d-98cf-4b55-8a4a-484ea2eecf4a	Safety Officer & Mining Engineer	\N	open	t	2026-05-04 18:41:32.532579+00
c1b10834-522f-4ad0-820e-6d10e6f879e2	Sales Assistant	\N	open	t	2026-05-04 18:41:32.533801+00
1b75c49c-b024-4903-b084-ebbfe3e2afca	Sales Coordinator	\N	open	t	2026-05-04 18:41:32.535037+00
2f16a423-50d2-45f3-a70a-4123ee43e8fb	Sales Manager	\N	open	t	2026-05-04 18:41:32.536485+00
23c78a29-3062-4568-a72f-5bc3b7fef973	Sales Officer	\N	open	t	2026-05-04 18:41:32.537989+00
a80fe54e-736a-45e9-a722-55228f4d0c25	Sales Officer - Events Guarding Security Sales:	\N	open	t	2026-05-04 18:41:32.539358+00
06caf82e-e98b-4188-9e54-3a1aab0596b9	Sales Officer - Guarding Security Services	\N	open	t	2026-05-04 18:41:32.540621+00
fedd1c85-0de5-4b91-821b-727ee3b0c485	Sales Planning & Forecasting Executive	\N	open	t	2026-05-04 18:41:32.541911+00
0fc8de81-9c93-414a-b60e-bf06cadf872a	Sales Representative	\N	open	t	2026-05-04 18:41:32.543236+00
27d449fc-1a69-43ce-81e3-a588c8f36a47	Security Guard	\N	open	t	2026-05-04 18:41:32.544376+00
20f65cfe-e8f7-4d46-af45-c053188f5f93	Senior AP Accountant	\N	open	t	2026-05-04 18:41:32.545622+00
7ddf64e8-1ad1-45b8-bc63-fd79cf187a00	Senior Accountant	\N	open	t	2026-05-04 18:41:32.546879+00
7c3b1b97-b9aa-4e31-8bb7-4f050e0a1302	Senior Check Point Technician	\N	open	t	2026-05-04 18:41:32.548047+00
60e06938-4789-4407-85c3-5e8b52e5f569	Senior Collection Officer	\N	open	t	2026-05-04 18:41:32.549315+00
ca17ca7a-6e0c-4038-a63c-2d8dd357d334	Senior Denter	\N	open	t	2026-05-04 18:41:32.550487+00
b044eb4c-7ddc-4c8e-b0db-61d8481f8bf8	Senior FP&A Specialist	\N	open	t	2026-05-04 18:41:32.551807+00
250a25cd-82ae-4db8-b282-cc638614b0d9	Senior Financial Reporting Specialist	\N	open	t	2026-05-04 18:41:32.552923+00
8038b709-2281-4590-b013-2bb16f588146	Senior Graphic Designer	\N	open	t	2026-05-04 18:41:32.554123+00
abff140e-4815-4a9f-8196-65fa7d46a9a1	Senior IT Internal Auditor	\N	open	t	2026-05-04 18:41:32.555255+00
b7d6804a-a3a0-4361-929d-b413749091e0	Senior Internal Auditor	\N	open	t	2026-05-04 18:41:32.556407+00
7b220d89-a9ef-4576-8b9a-389c187addf8	Senior Pre-Sales Engineer	\N	open	t	2026-05-04 18:41:32.557527+00
71bc0fae-1ef7-4bc0-a586-5114528c1290	Senior QC Engineer	\N	open	t	2026-05-04 18:41:32.558631+00
23fd522b-3231-49e1-8b9c-eb87d1cef024	Senior Software Programmer	\N	open	t	2026-05-04 18:41:32.559717+00
01f97b28-90f9-486d-8889-7aa8aa22c60c	Senior Talent Acquisation Specialist	\N	open	t	2026-05-04 18:41:32.560679+00
b837b2f2-7d1a-4e78-8857-8fde91ad0d35	Senior Talent Acquisition Specialist	\N	open	t	2026-05-04 18:41:32.561752+00
d32da4b0-c88e-452f-9788-83ce5dd11b09	Service Advisor	\N	open	t	2026-05-04 18:41:32.56275+00
5e2d6a6d-816a-445a-bb88-287aa1f42f10	Shovel Operator	\N	open	t	2026-05-04 18:41:32.564334+00
883cca9f-b52d-4616-be1d-d58c4c689af1	Site Ambassador	\N	open	t	2026-05-04 18:41:32.566683+00
66d7bec9-e6e6-4bd3-953c-713149824155	Site Attendant	\N	open	t	2026-05-04 18:41:32.568054+00
a4473b19-a09a-455e-a277-86ce2f13001c	Site Foreman	\N	open	t	2026-05-04 18:41:32.569176+00
a1c67a61-4e5f-483a-b77b-07b2871761fc	Site Technician	\N	open	t	2026-05-04 18:41:32.570455+00
ae7b01a5-6b84-4a1f-90fd-261c7bc25daf	Site Technician Cum Driver	\N	open	t	2026-05-04 18:41:32.57157+00
12a48735-acb1-4920-a454-83982a3da4bc	Site/Lab Technician	\N	open	t	2026-05-04 18:41:32.572645+00
edd18f16-17b1-4f0e-bcd9-80d51c53357a	Software Programmer	\N	open	t	2026-05-04 18:41:32.57378+00
81ba4339-7874-4b53-933b-8226ee9af989	Sr. Credit Management Specialist	\N	open	t	2026-05-04 18:41:32.57493+00
9ed0caaa-defe-4137-857d-81ebcfdc8746	Sr. Data Analyst	\N	open	t	2026-05-04 18:41:32.576029+00
02814b85-321e-4d5e-99b9-1609cb99dec1	Sr. GL Accountant	\N	open	t	2026-05-04 18:41:32.577214+00
6639c81b-b7bf-4006-819c-60cb0b754acc	Sr. HSE Officer	\N	open	t	2026-05-04 18:41:32.578455+00
39c77118-2f6c-443f-8561-76010635b367	Sr. Hydraulic Mechanic	\N	open	t	2026-05-04 18:41:32.579752+00
2a38095c-ea53-4da3-b334-144450173657	Sr. Payroll Specialist	\N	open	t	2026-05-04 18:41:32.580928+00
e17fc3db-0fd9-49cc-8928-5b71924d3efd	Sr. Qc Technician	\N	open	t	2026-05-04 18:41:32.582293+00
d33ba545-1be4-40ac-9bfa-ce4d565439ff	Sr. Senior Treasury Specialist	\N	open	t	2026-05-04 18:41:32.583423+00
e920bffc-7fd3-433e-8c19-7007890e2713	Sr. Site Technician	\N	open	t	2026-05-04 18:41:32.584361+00
c7736e4b-f69f-42ab-bfba-6310ed073e61	Static Pump Foreman	\N	open	t	2026-05-04 18:41:32.585464+00
a8dc9c07-57d0-42ef-82c9-b4a53c565ced	Static Pump Operator	\N	open	t	2026-05-04 18:41:32.586463+00
3a3f239d-a4b6-460d-86ce-12164f1c3d01	Stationary Pump & Pipeline Supervisor	\N	open	t	2026-05-04 18:41:32.587477+00
b924ff65-5094-42d5-9c8f-f8bf81635adf	Stationary Pump Helper	\N	open	t	2026-05-04 18:41:32.5885+00
9d390065-05c0-48da-9fd8-fbfc35ec6cc8	Stationary pump pipeline helper	\N	open	t	2026-05-04 18:41:32.589629+00
cafd8ce7-a723-4e4f-a783-0e265ab8b55f	Structure Carpenter	\N	open	t	2026-05-04 18:41:32.590816+00
f40b1ea4-c7d8-4e03-8bce-aa5b0ad48ed9	Supply Chain Director	\N	open	t	2026-05-04 18:41:32.592449+00
4b5d9dfd-634e-443f-b1ac-91ca8c7fa15f	TM Driver / TM Drivers	\N	open	t	2026-05-04 18:41:32.593799+00
31b8fabd-73ea-4eb1-a8a5-95fab1e342ad	Talent Acquisition Specialist	\N	open	t	2026-05-04 18:41:32.594999+00
695c3c5d-8e76-4b81-aaa5-dab2592fd9d9	Technical Director	\N	open	t	2026-05-04 18:41:32.596098+00
8c97570c-687f-49ef-9ea2-7b68a402b004	Technical Manager	\N	open	t	2026-05-04 18:41:32.597059+00
328ac32e-9d95-470f-80ec-fe260f3631e9	Technology Business Unit Head	\N	open	t	2026-05-04 18:41:32.598029+00
d9823d46-40cc-4818-885c-49f333eaa67e	Timekeeper	\N	open	t	2026-05-04 18:41:32.599157+00
2b934c5e-004a-42dc-b70a-8400e33c6a73	Trade Purchase Coordinator	\N	open	t	2026-05-04 18:41:32.600287+00
06d5d7be-aa0c-4950-9272-d2d71c53a762	Treasury Accountant	\N	open	t	2026-05-04 18:41:32.601268+00
e9b8cdf2-b975-429b-a9e3-505d74f0e2b9	Treasury Manager	\N	open	t	2026-05-04 18:41:32.602292+00
389f96cc-7c34-4d83-b2f4-cc53889be3be	Treasury Specialist	\N	open	t	2026-05-04 18:41:32.603381+00
5ac55f58-fa0f-452c-b06c-cd40937753de	Treasury Team Leader	\N	open	t	2026-05-04 18:41:32.604448+00
c76b3a6b-e580-451a-a6ad-2d563564097b	Tyre Data Collector	\N	open	t	2026-05-04 18:41:32.605656+00
09077605-e1c4-4aea-a9b4-69f5ab2f648c	Tyre Management Section Head	\N	open	t	2026-05-04 18:41:32.606968+00
1ddda62c-80fe-4c3c-9df5-8091d0cc06e5	Tyre Planning Engineer	\N	open	t	2026-05-04 18:41:32.608331+00
ce39f180-3d35-49a0-86e1-ea4b58916c62	Tyreman	\N	open	t	2026-05-04 18:41:32.609432+00
aae54201-1cb1-4cf8-ae6e-764f5ecea125	Vice President Commercial	\N	open	t	2026-05-04 18:41:32.61047+00
9c10ca5a-ec69-4827-9848-5518f5c9ae5d	Vice President Shared Services	\N	open	t	2026-05-04 18:41:33.459243+00
c3b240b5-630f-4d4a-971c-b353c16981df	Watchman	\N	open	t	2026-05-04 18:41:33.46071+00
8bfc6fb6-498f-4605-ac4a-942d1bd39f54	Welder	\N	open	t	2026-05-04 18:41:33.462016+00
bace5798-bc0b-4f41-af08-1fd3b420abd6	Wheel Loader Operator	\N	open	t	2026-05-04 18:41:33.463062+00
bd787e4f-1755-4ddc-a195-fdba6fdaa1c8	Workshop Engineer	\N	open	t	2026-05-04 18:41:33.464363+00
0c1c01bb-0a01-4945-8bf2-41215f4ae300	Workshop Supervisor	\N	open	t	2026-05-04 18:41:33.465515+00
e107c6a6-cff7-4ac2-870d-03b601b75430	Yard Foreman	\N	open	t	2026-05-04 18:41:33.466845+00
ea0b8771-c3a2-4a18-88ab-83abb7a53ef8	dina the cleaner	\N	open	t	2026-05-04 18:41:33.468063+00
\.


--
-- Data for Name: sub_actions; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.sub_actions (id, action_name, name, is_active, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: ticket_groups; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.ticket_groups (id, group_code, created_at) FROM stdin;
\.


--
-- Data for Name: ticket_phase_history; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.ticket_phase_history (id, ticket_id, board_phase_id, advanced_by, created_at) FROM stdin;
\.


--
-- Data for Name: ticket_statuses; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.ticket_statuses (id, name, is_active, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: ticket_types; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.ticket_types (id, name, is_active, sort_order, created_at) FROM stdin;
\.


--
-- Data for Name: ticket_updates; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.ticket_updates (id, ticket_id, submitted_by, submitted_at, effective_date, changes) FROM stdin;
\.


--
-- Data for Name: tickets; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.tickets (id, group_id, is_group_master, task_owner_id, entry_date, ticket_number, ticket_type, ticket_status, ticket_date, position_id, management_type, department_id, ultimate_hm_id, direct_hm_id, country_company_id, candidate_count, action, sub_action, remarks, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_visibility_grants; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.user_visibility_grants (id, viewer_id, target_id, granted_by, granted_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: talentapp
--

COPY public.users (id, name, email, password_hash, role, is_active, date_override_enabled, date_override_expires_at, created_at, updated_at) FROM stdin;
00000000-0000-0000-0000-000000000001	Admin	admin@talent.internal	$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi	admin	t	f	\N	2026-05-04 18:41:18.454279+00	2026-05-04 18:41:18.454279+00
\.


--
-- Name: action_subaction_rules action_subaction_rules_action_value_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.action_subaction_rules
    ADD CONSTRAINT action_subaction_rules_action_value_key UNIQUE (action_value);


--
-- Name: action_subaction_rules action_subaction_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.action_subaction_rules
    ADD CONSTRAINT action_subaction_rules_pkey PRIMARY KEY (id);


--
-- Name: actions actions_name_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.actions
    ADD CONSTRAINT actions_name_key UNIQUE (name);


--
-- Name: actions actions_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.actions
    ADD CONSTRAINT actions_pkey PRIMARY KEY (id);


--
-- Name: assessment_levels assessment_levels_name_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.assessment_levels
    ADD CONSTRAINT assessment_levels_name_key UNIQUE (name);


--
-- Name: assessment_levels assessment_levels_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.assessment_levels
    ADD CONSTRAINT assessment_levels_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: board_column_fields board_column_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_column_fields
    ADD CONSTRAINT board_column_fields_pkey PRIMARY KEY (id);


--
-- Name: board_column_transitions board_column_transitions_from_column_id_to_column_id_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_column_transitions
    ADD CONSTRAINT board_column_transitions_from_column_id_to_column_id_key UNIQUE (from_column_id, to_column_id);


--
-- Name: board_column_transitions board_column_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_column_transitions
    ADD CONSTRAINT board_column_transitions_pkey PRIMARY KEY (id);


--
-- Name: board_columns board_columns_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_columns
    ADD CONSTRAINT board_columns_pkey PRIMARY KEY (id);


--
-- Name: board_configs board_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_configs
    ADD CONSTRAINT board_configs_pkey PRIMARY KEY (id);


--
-- Name: board_configs board_configs_ticket_type_id_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_configs
    ADD CONSTRAINT board_configs_ticket_type_id_key UNIQUE (ticket_type_id);


--
-- Name: board_entries board_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_entries
    ADD CONSTRAINT board_entries_pkey PRIMARY KEY (id);


--
-- Name: board_phases board_phases_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_phases
    ADD CONSTRAINT board_phases_pkey PRIMARY KEY (id);


--
-- Name: country_companies country_companies_label_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.country_companies
    ADD CONSTRAINT country_companies_label_key UNIQUE (label);


--
-- Name: country_companies country_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.country_companies
    ADD CONSTRAINT country_companies_pkey PRIMARY KEY (id);


--
-- Name: departments departments_name_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_name_key UNIQUE (name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: hiring_managers hiring_managers_name_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.hiring_managers
    ADD CONSTRAINT hiring_managers_name_key UNIQUE (name);


--
-- Name: hiring_managers hiring_managers_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.hiring_managers
    ADD CONSTRAINT hiring_managers_pkey PRIMARY KEY (id);


--
-- Name: management_types management_types_name_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.management_types
    ADD CONSTRAINT management_types_name_key UNIQUE (name);


--
-- Name: management_types management_types_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.management_types
    ADD CONSTRAINT management_types_pkey PRIMARY KEY (id);


--
-- Name: position_board_batches position_board_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_batches
    ADD CONSTRAINT position_board_batches_pkey PRIMARY KEY (id);


--
-- Name: position_board_candidates position_board_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_candidates
    ADD CONSTRAINT position_board_candidates_pkey PRIMARY KEY (id);


--
-- Name: position_board_hr_interviews position_board_hr_interviews_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_hr_interviews
    ADD CONSTRAINT position_board_hr_interviews_pkey PRIMARY KEY (id);


--
-- Name: position_board_log position_board_log_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_log
    ADD CONSTRAINT position_board_log_pkey PRIMARY KEY (id);


--
-- Name: position_board_screenings position_board_screenings_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_screenings
    ADD CONSTRAINT position_board_screenings_pkey PRIMARY KEY (id);


--
-- Name: position_board_stages position_board_stages_candidate_id_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_stages
    ADD CONSTRAINT position_board_stages_candidate_id_key UNIQUE (candidate_id);


--
-- Name: position_board_stages position_board_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_stages
    ADD CONSTRAINT position_board_stages_pkey PRIMARY KEY (id);


--
-- Name: positions positions_name_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_name_key UNIQUE (name);


--
-- Name: positions positions_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.positions
    ADD CONSTRAINT positions_pkey PRIMARY KEY (id);


--
-- Name: sub_actions sub_actions_action_name_name_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.sub_actions
    ADD CONSTRAINT sub_actions_action_name_name_key UNIQUE (action_name, name);


--
-- Name: sub_actions sub_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.sub_actions
    ADD CONSTRAINT sub_actions_pkey PRIMARY KEY (id);


--
-- Name: ticket_groups ticket_groups_group_code_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.ticket_groups
    ADD CONSTRAINT ticket_groups_group_code_key UNIQUE (group_code);


--
-- Name: ticket_groups ticket_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.ticket_groups
    ADD CONSTRAINT ticket_groups_pkey PRIMARY KEY (id);


--
-- Name: ticket_phase_history ticket_phase_history_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.ticket_phase_history
    ADD CONSTRAINT ticket_phase_history_pkey PRIMARY KEY (id);


--
-- Name: ticket_statuses ticket_statuses_name_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.ticket_statuses
    ADD CONSTRAINT ticket_statuses_name_key UNIQUE (name);


--
-- Name: ticket_statuses ticket_statuses_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.ticket_statuses
    ADD CONSTRAINT ticket_statuses_pkey PRIMARY KEY (id);


--
-- Name: ticket_types ticket_types_name_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_name_key UNIQUE (name);


--
-- Name: ticket_types ticket_types_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.ticket_types
    ADD CONSTRAINT ticket_types_pkey PRIMARY KEY (id);


--
-- Name: ticket_updates ticket_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.ticket_updates
    ADD CONSTRAINT ticket_updates_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_ticket_number_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_ticket_number_key UNIQUE (ticket_number);


--
-- Name: board_column_fields uq_board_column_fields_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_column_fields
    ADD CONSTRAINT uq_board_column_fields_key UNIQUE (board_column_id, field_key);


--
-- Name: board_columns uq_board_columns_position; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_columns
    ADD CONSTRAINT uq_board_columns_position UNIQUE (board_config_id, "position");


--
-- Name: board_phases uq_board_phases_position; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_phases
    ADD CONSTRAINT uq_board_phases_position UNIQUE (board_config_id, "position");


--
-- Name: user_visibility_grants user_visibility_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.user_visibility_grants
    ADD CONSTRAINT user_visibility_grants_pkey PRIMARY KEY (id);


--
-- Name: user_visibility_grants user_visibility_grants_viewer_id_target_id_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.user_visibility_grants
    ADD CONSTRAINT user_visibility_grants_viewer_id_target_id_key UNIQUE (viewer_id, target_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_changed_at; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_audit_changed_at ON public.audit_log USING btree (changed_at DESC);


--
-- Name: idx_audit_ticket; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_audit_ticket ON public.audit_log USING btree (ticket_id);


--
-- Name: idx_board_column_fields_column; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_board_column_fields_column ON public.board_column_fields USING btree (board_column_id);


--
-- Name: idx_board_columns_config; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_board_columns_config ON public.board_columns USING btree (board_config_id);


--
-- Name: idx_board_entries_column; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_board_entries_column ON public.board_entries USING btree (board_column_id);


--
-- Name: idx_board_entries_ticket; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_board_entries_ticket ON public.board_entries USING btree (ticket_id);


--
-- Name: idx_board_phases_config; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_board_phases_config ON public.board_phases USING btree (board_config_id);


--
-- Name: idx_pbl_position; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_pbl_position ON public.position_board_log USING btree (position_id, created_at DESC);


--
-- Name: idx_ticket_phase_history_ticket; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_ticket_phase_history_ticket ON public.ticket_phase_history USING btree (ticket_id);


--
-- Name: idx_ticket_updates_submitted_at; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_ticket_updates_submitted_at ON public.ticket_updates USING btree (submitted_at DESC);


--
-- Name: idx_ticket_updates_ticket; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_ticket_updates_ticket ON public.ticket_updates USING btree (ticket_id);


--
-- Name: idx_tickets_department; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_tickets_department ON public.tickets USING btree (department_id);


--
-- Name: idx_tickets_entry_date; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_tickets_entry_date ON public.tickets USING btree (entry_date DESC);


--
-- Name: idx_tickets_fts; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_tickets_fts ON public.tickets USING gin (to_tsvector('english'::regconfig, (((((COALESCE(ticket_number, ''::character varying))::text || ' '::text) || COALESCE(remarks, ''::text)) || ' '::text) || (COALESCE(sub_action, ''::character varying))::text)));


--
-- Name: idx_tickets_group; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_tickets_group ON public.tickets USING btree (group_id);


--
-- Name: idx_tickets_group_master; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_tickets_group_master ON public.tickets USING btree (group_id, is_group_master);


--
-- Name: idx_tickets_owner; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_tickets_owner ON public.tickets USING btree (task_owner_id);


--
-- Name: idx_tickets_position; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_tickets_position ON public.tickets USING btree (position_id);


--
-- Name: idx_tickets_status; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_tickets_status ON public.tickets USING btree (ticket_status);


--
-- Name: idx_tickets_sub_action; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_tickets_sub_action ON public.tickets USING btree (sub_action);


--
-- Name: idx_tickets_ticket_date; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_tickets_ticket_date ON public.tickets USING btree (ticket_date DESC);


--
-- Name: idx_tickets_type; Type: INDEX; Schema: public; Owner: talentapp
--

CREATE INDEX idx_tickets_type ON public.tickets USING btree (ticket_type);


--
-- Name: tickets tickets_group_status_sync; Type: TRIGGER; Schema: public; Owner: talentapp
--

CREATE TRIGGER tickets_group_status_sync AFTER UPDATE OF ticket_status ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.sync_group_status();


--
-- Name: tickets tickets_updated_at; Type: TRIGGER; Schema: public; Owner: talentapp
--

CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: users users_updated_at; Type: TRIGGER; Schema: public; Owner: talentapp
--

CREATE TRIGGER users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: audit_log audit_log_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: audit_log audit_log_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: board_column_fields board_column_fields_board_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_column_fields
    ADD CONSTRAINT board_column_fields_board_column_id_fkey FOREIGN KEY (board_column_id) REFERENCES public.board_columns(id) ON DELETE CASCADE;


--
-- Name: board_column_transitions board_column_transitions_from_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_column_transitions
    ADD CONSTRAINT board_column_transitions_from_column_id_fkey FOREIGN KEY (from_column_id) REFERENCES public.board_columns(id) ON DELETE CASCADE;


--
-- Name: board_column_transitions board_column_transitions_to_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_column_transitions
    ADD CONSTRAINT board_column_transitions_to_column_id_fkey FOREIGN KEY (to_column_id) REFERENCES public.board_columns(id) ON DELETE CASCADE;


--
-- Name: board_columns board_columns_board_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_columns
    ADD CONSTRAINT board_columns_board_config_id_fkey FOREIGN KEY (board_config_id) REFERENCES public.board_configs(id) ON DELETE CASCADE;


--
-- Name: board_configs board_configs_ticket_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_configs
    ADD CONSTRAINT board_configs_ticket_type_id_fkey FOREIGN KEY (ticket_type_id) REFERENCES public.ticket_types(id) ON DELETE CASCADE;


--
-- Name: board_entries board_entries_board_column_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_entries
    ADD CONSTRAINT board_entries_board_column_id_fkey FOREIGN KEY (board_column_id) REFERENCES public.board_columns(id) ON DELETE CASCADE;


--
-- Name: board_entries board_entries_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_entries
    ADD CONSTRAINT board_entries_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: board_phases board_phases_board_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.board_phases
    ADD CONSTRAINT board_phases_board_config_id_fkey FOREIGN KEY (board_config_id) REFERENCES public.board_configs(id) ON DELETE CASCADE;


--
-- Name: position_board_batches position_board_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_batches
    ADD CONSTRAINT position_board_batches_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: position_board_batches position_board_batches_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_batches
    ADD CONSTRAINT position_board_batches_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE;


--
-- Name: position_board_candidates position_board_candidates_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_candidates
    ADD CONSTRAINT position_board_candidates_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.position_board_batches(id) ON DELETE CASCADE;


--
-- Name: position_board_hr_interviews position_board_hr_interviews_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_hr_interviews
    ADD CONSTRAINT position_board_hr_interviews_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: position_board_hr_interviews position_board_hr_interviews_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_hr_interviews
    ADD CONSTRAINT position_board_hr_interviews_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE;


--
-- Name: position_board_log position_board_log_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_log
    ADD CONSTRAINT position_board_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: position_board_log position_board_log_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_log
    ADD CONSTRAINT position_board_log_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE;


--
-- Name: position_board_screenings position_board_screenings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_screenings
    ADD CONSTRAINT position_board_screenings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: position_board_screenings position_board_screenings_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_screenings
    ADD CONSTRAINT position_board_screenings_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE;


--
-- Name: position_board_stages position_board_stages_candidate_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_stages
    ADD CONSTRAINT position_board_stages_candidate_id_fkey FOREIGN KEY (candidate_id) REFERENCES public.position_board_candidates(id) ON DELETE CASCADE;


--
-- Name: position_board_stages position_board_stages_moved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_stages
    ADD CONSTRAINT position_board_stages_moved_by_fkey FOREIGN KEY (moved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: position_board_stages position_board_stages_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.position_board_stages
    ADD CONSTRAINT position_board_stages_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE CASCADE;


--
-- Name: ticket_phase_history ticket_phase_history_advanced_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.ticket_phase_history
    ADD CONSTRAINT ticket_phase_history_advanced_by_fkey FOREIGN KEY (advanced_by) REFERENCES public.users(id);


--
-- Name: ticket_phase_history ticket_phase_history_board_phase_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.ticket_phase_history
    ADD CONSTRAINT ticket_phase_history_board_phase_id_fkey FOREIGN KEY (board_phase_id) REFERENCES public.board_phases(id) ON DELETE CASCADE;


--
-- Name: ticket_phase_history ticket_phase_history_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.ticket_phase_history
    ADD CONSTRAINT ticket_phase_history_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: ticket_updates ticket_updates_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.ticket_updates
    ADD CONSTRAINT ticket_updates_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ticket_updates ticket_updates_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.ticket_updates
    ADD CONSTRAINT ticket_updates_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_country_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_country_company_id_fkey FOREIGN KEY (country_company_id) REFERENCES public.country_companies(id);


--
-- Name: tickets tickets_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id);


--
-- Name: tickets tickets_direct_hm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_direct_hm_id_fkey FOREIGN KEY (direct_hm_id) REFERENCES public.hiring_managers(id);


--
-- Name: tickets tickets_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.ticket_groups(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_position_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_position_id_fkey FOREIGN KEY (position_id) REFERENCES public.positions(id);


--
-- Name: tickets tickets_task_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_task_owner_id_fkey FOREIGN KEY (task_owner_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tickets tickets_ultimate_hm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_ultimate_hm_id_fkey FOREIGN KEY (ultimate_hm_id) REFERENCES public.hiring_managers(id);


--
-- Name: user_visibility_grants user_visibility_grants_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.user_visibility_grants
    ADD CONSTRAINT user_visibility_grants_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_visibility_grants user_visibility_grants_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.user_visibility_grants
    ADD CONSTRAINT user_visibility_grants_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_visibility_grants user_visibility_grants_viewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: talentapp
--

ALTER TABLE ONLY public.user_visibility_grants
    ADD CONSTRAINT user_visibility_grants_viewer_id_fkey FOREIGN KEY (viewer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict Be2sFDdwTp0LhiCeiigTmUApiMGOKub7Tz9OHZQllVBS5af7drOKc2u2sP9BloX

