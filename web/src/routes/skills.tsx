import { Effect } from "effect";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Sparkles, Trash2, Shield, RefreshCw, Plus, Pencil, Save, X, Code } from "@/components/icons";
import { PageShell, PageTitle, FormField } from "@/components/layout";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { createMutation, createQuery, invalidateQueries } from "@/api/use-api";
import { qk, fetchSkills, fetchSkill, deleteSkill, createSkill, updateSkill } from "@/api/queries";
import type { Skill, SkillDetail } from "@/api/schemas";
import { toast } from "@/components/toast";

type EditorMode = "view" | "edit" | "create";

function SkillRow(props: {
  readonly skill: Skill;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onDeleted?: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = createSignal(false);

  const deleteMut = createMutation({
    fn: (name: string) => deleteSkill(name),
    onSuccess: (_data, name) => {
      invalidateQueries(qk.skills);
      setConfirmDelete(false);
      props.onDeleted?.(name);
      toast.success(`Skill "${name}" deleted`);
    },
    onError: (msg) => toast.error(msg),
  });

  const isManaged = () => props.skill.operator_managed === true;

  return (
    <div
      class="skill-row"
      classList={{ "skill-row-selected": props.selected }}
      onClick={props.onSelect}
    >
      <Sparkles size={14} style={{ "flex-shrink": "0", color: "var(--muted-foreground)" }} />

      <div class="skill-row-info">
        <span class="skill-row-id">{props.skill.id}</span>
        <Show when={props.skill.description}>
          <span class="skill-row-desc">{props.skill.description}</span>
        </Show>
      </div>

      <span class={`skill-badge ${isManaged() ? "skill-badge-managed" : "skill-badge-custom"}`}>
        <Show when={isManaged()}>
          <Shield size={10} />
        </Show>
        {isManaged() ? "Managed" : "Custom"}
      </span>

      <Show when={!isManaged()}>
        <Show
          when={!confirmDelete()}
          fallback={
            <div class="skill-delete-confirm" onClick={(e) => e.stopPropagation()}>
              <button
                class="btn btn-ghost btn-sm"
                style={{ color: "var(--destructive)", "font-size": "var(--text-xs)" }}
                disabled={deleteMut.isLoading}
                onClick={() => deleteMut.mutate(props.skill.id)}
              >
                {deleteMut.isLoading ? "..." : "Confirm"}
              </button>
              <button
                class="btn btn-ghost btn-sm"
                style={{ color: "var(--muted-foreground)", "font-size": "var(--text-xs)" }}
                disabled={deleteMut.isLoading}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </div>
          }
        >
          <button
            class="skill-delete-btn"
            title="Delete skill"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDelete(true);
            }}
          >
            <Trash2 size={14} />
          </button>
        </Show>
      </Show>
    </div>
  );
}

function SkillEditor(props: {
  readonly mode: EditorMode;
  readonly detail: SkillDetail | undefined;
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
  readonly nameError?: string | null;
  readonly isSaving: boolean;
  readonly onNameChange: (value: string) => void;
  readonly onDescriptionChange: (value: string) => void;
  readonly onInstructionsChange: (value: string) => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
}) {
  return (
    <div class="skills-detail-card card">
      <div class="skills-detail-header">
        <div>
          <div class="card-title">{props.mode === "create" ? "New skill" : `Edit ${props.detail?.id ?? "skill"}`}</div>
          <div class="skills-detail-subtitle">
            {props.mode === "create"
              ? "Create a new custom skill with YAML frontmatter and markdown instructions"
              : "Update the description and instructions for this skill"}
          </div>
        </div>
        <button class="btn btn-ghost btn-sm btn-icon" onClick={props.onCancel} aria-label="Cancel editing">
          <X size={14} />
        </button>
      </div>

      <div class="skills-editor-grid">
        <Show when={props.mode === "create"}>
          <FormField label="Name" hint="Lowercase letters, digits, and hyphens only">
            <input
              class={`input ${props.nameError ? "config-textarea-invalid" : ""}`}
              value={props.name}
              placeholder="my-skill"
              onInput={(e) => props.onNameChange(e.currentTarget.value)}
            />
          </FormField>
        </Show>

        <FormField label="Description">
          <input
            class="input"
            value={props.description}
            placeholder="What this skill helps with"
            onInput={(e) => props.onDescriptionChange(e.currentTarget.value)}
          />
        </FormField>

        <FormField label="Instructions" hint="Markdown injected when the skill is activated">
          <textarea
            class="textarea skills-editor-textarea"
            value={props.instructions}
            placeholder="# When to use\n\nUse this skill when..."
            onInput={(e) => props.onInstructionsChange(e.currentTarget.value)}
          />
        </FormField>
      </div>

      <div class="skills-detail-actions">
        <button class="btn btn-ghost btn-sm" onClick={props.onCancel}>Cancel</button>
        <button class="btn btn-primary btn-sm" disabled={props.isSaving} onClick={props.onSave}>
          <Save size={14} />
          {props.isSaving ? "Saving..." : props.mode === "create" ? "Create skill" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

export default function Skills() {
  const [selectedSkillId, setSelectedSkillId] = createSignal("");
  const [mode, setMode] = createSignal<EditorMode>("view");
  const [draftName, setDraftName] = createSignal("");
  const [draftDescription, setDraftDescription] = createSignal("");
  const [draftInstructions, setDraftInstructions] = createSignal("");

  const skillsQ = createQuery({
    key: qk.skills,
    fn: fetchSkills,
  });

  const detailQ = createQuery({
    key: qk.skillDetail("active"),
    fn: () => {
      const id = selectedSkillId();
      if (id.length === 0) {
        return Effect.succeed<SkillDetail | undefined>(undefined);
      }
      return fetchSkill(id);
    },
  });

  const skills = createMemo<readonly Skill[]>(() => skillsQ.data?.skills ?? []);
  const selectedSkill = createMemo(() => skills().find((skill) => skill.id === selectedSkillId()));
  const selectedDetail = createMemo(() => detailQ.data);
  const selectedIsManaged = createMemo(() => selectedDetail()?.operator_managed === true);

  const createMut = createMutation({
    fn: createSkill,
    onSuccess: (data) => {
      invalidateQueries(qk.skills);
      setSelectedSkillId(data.id);
      setMode("view");
      toast.success(`Skill "${data.id}" created`);
    },
    onError: (msg) => toast.error(msg),
  });

  const updateMut = createMutation({
    fn: (payload: { name: string; description: string; instructions: string }) =>
      updateSkill(payload.name, {
        description: payload.description,
        instructions: payload.instructions,
      }),
    onSuccess: (_data, args) => {
      invalidateQueries(qk.skills);
      setMode("view");
      detailQ.refetch();
      toast.success(`Skill "${args.name}" updated`);
    },
    onError: (msg) => toast.error(msg),
  });

  createEffect(() => {
    const list = skills();
    if (mode() === "create") return;
    if (list.length === 0) {
      setSelectedSkillId("");
      return;
    }
    if (!selectedSkillId() || !list.some((skill) => skill.id === selectedSkillId())) {
      setSelectedSkillId(list[0]?.id ?? "");
    }
  });

  createEffect(() => {
    const id = selectedSkillId();
    if (mode() === "create" || id.length === 0) return;
    detailQ.refetch();
  });

  function startCreate() {
    setMode("create");
    setDraftName("");
    setDraftDescription("");
    setDraftInstructions("# When to use\n\nUse this skill when...\n\n# Instructions\n\n");
  }

  function startEdit() {
    const detail = selectedDetail();
    if (!detail) return;
    setMode("edit");
    setDraftName(detail.id);
    setDraftDescription(detail.description);
    setDraftInstructions(detail.instructions);
  }

  function cancelEditor() {
    setMode("view");
  }

  function handleDeleted(id: string) {
    if (selectedSkillId() === id) {
      setSelectedSkillId("");
      setMode("view");
    }
  }

  const nameError = createMemo(() => {
    if (mode() !== "create") return null;
    const value = draftName().trim();
    if (value.length === 0) return null;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 64) {
      return "Use 1-64 lowercase letters, digits, and hyphens";
    }
    return null;
  });

  function saveEditor() {
    const description = draftDescription().trim();
    const instructions = draftInstructions().trim();
    if (description.length === 0) {
      toast.error("Description is required");
      return;
    }
    if (instructions.length === 0) {
      toast.error("Instructions are required");
      return;
    }

    if (mode() === "create") {
      const name = draftName().trim();
      if (name.length === 0 || nameError()) {
        toast.error(nameError() ?? "Skill name is required");
        return;
      }
      createMut.mutate({ name, description, instructions });
      return;
    }

    if (mode() === "edit" && selectedDetail()) {
      updateMut.mutate({
        name: selectedDetail()!.id,
        description,
        instructions,
      });
    }
  }

  return (
    <PageShell
      maxWidth="5xl"
      header={
        <PageTitle icon={<Sparkles size={14} />} title="Skills">
          <button class="btn btn-secondary btn-sm" onClick={startCreate}>
            <Plus size={14} />
            New skill
          </button>
          <button class="btn btn-ghost btn-icon btn-sm" title="Refresh" onClick={() => { skillsQ.refetch(); if (selectedSkillId()) detailQ.refetch(); }}>
            <RefreshCw size={14} class={skillsQ.isLoading ? "icon-spin" : ""} />
          </button>
          <span style={{ "font-size": "10px", color: "var(--muted-foreground)", "font-variant-numeric": "tabular-nums" }}>
            {skills().length} skills
          </span>
        </PageTitle>
      }
    >
      <div class="route-enter" style={{ display: "flex", "flex-direction": "column", gap: "var(--space-4)" }}>
        <Show when={skillsQ.isLoading}>
          <div class="skills-layout">
            <div class="card" style={{ padding: 0, overflow: "hidden" }}>
              <div class="skeleton" style={{ height: "56px" }} />
              <div class="skeleton" style={{ height: "56px" }} />
              <div class="skeleton" style={{ height: "56px" }} />
            </div>
            <div class="card" style={{ padding: "var(--space-4)" }}>
              <div class="skeleton" style={{ height: "24px", width: "30%", "margin-bottom": "var(--space-4)" }} />
              <div class="skeleton" style={{ height: "140px" }} />
            </div>
          </div>
        </Show>

        <Show when={skillsQ.isError}>
          <p style={{ "font-size": "var(--text-sm)", color: "var(--destructive)" }}>
            Failed to load skills.
          </p>
        </Show>

        <Show when={!skillsQ.isLoading && !skillsQ.isError && skills().length === 0 && mode() !== "create"}>
          <div class="empty-state">
            <Sparkles size={24} />
            <p>No skills registered</p>
            <span style={{ "font-size": "var(--text-xs)", color: "var(--muted-foreground)" }}>
              Create a custom skill to add reusable instructions for this agent.
            </span>
            <button class="btn btn-primary btn-sm" onClick={startCreate}>
              <Plus size={14} />
              New skill
            </button>
          </div>
        </Show>

        <Show when={!skillsQ.isLoading && !skillsQ.isError && (skills().length > 0 || mode() === "create")}>
          <div class="skills-layout">
            <div class="card" style={{ padding: 0, overflow: "hidden" }}>
              <Show when={skills().length > 0} fallback={<div class="config-empty"><Sparkles size={20} /><p>No skills yet</p></div>}>
                <For each={skills()}>
                  {(skill) => (
                    <SkillRow
                      skill={skill}
                      selected={skill.id === selectedSkillId() && mode() !== "create"}
                      onSelect={() => {
                        setSelectedSkillId(skill.id);
                        setMode("view");
                      }}
                      onDeleted={handleDeleted}
                    />
                  )}
                </For>
              </Show>
            </div>

            <Show
              when={mode() === "create" || mode() === "edit"}
              fallback={
                <Show
                  when={selectedSkillId().length > 0}
                  fallback={
                    <div class="skills-detail-card card skills-detail-empty">
                      <Sparkles size={20} />
                      <p>Select a skill to view it</p>
                    </div>
                  }
                >
                  <div class="skills-detail-card card">
                    <Show when={detailQ.isLoading && !selectedDetail()}>
                      <div style={{ display: "grid", gap: "var(--space-3)" }}>
                        <div class="skeleton" style={{ height: "24px", width: "40%" }} />
                        <div class="skeleton" style={{ height: "120px" }} />
                      </div>
                    </Show>

                    <Show when={detailQ.isError}>
                      <p style={{ color: "var(--destructive)", "font-size": "var(--text-sm)" }}>
                        Failed to load this skill.
                      </p>
                    </Show>

                    <Show when={selectedDetail()}>
                      {(detail) => (
                        <>
                          <div class="skills-detail-header">
                            <div>
                              <div class="card-title">{detail().id}</div>
                              <div class="skills-detail-subtitle">{detail().description}</div>
                            </div>

                            <div class="skills-detail-actions-inline">
                              <span class={`skill-badge ${detail().operator_managed ? "skill-badge-managed" : "skill-badge-custom"}`}>
                                <Show when={detail().operator_managed}><Shield size={10} /></Show>
                                {detail().operator_managed ? "Managed" : "Custom"}
                              </span>
                              <Show when={!selectedIsManaged()}>
                                <button class="btn btn-secondary btn-sm" onClick={startEdit}>
                                  <Pencil size={14} />
                                  Edit
                                </button>
                              </Show>
                            </div>
                          </div>

                          <div class="skills-meta-strip">
                            <Show when={detail().compatibility}><span class="config-summary-badge">{detail().compatibility}</span></Show>
                            <Show when={detail().license}><span class="config-summary-badge">{detail().license}</span></Show>
                          </div>

                          <div class="skills-section">
                            <div class="skills-section-title">Instructions</div>
                            <div class="skills-markdown markdown-body">
                              <MarkdownRenderer content={detail().instructions} />
                            </div>
                          </div>

                          <div class="skills-section">
                            <div class="skills-section-title">
                              <Code size={14} />
                              <span>Source</span>
                            </div>
                            <pre class="skills-source">{detail().raw}</pre>
                          </div>
                        </>
                      )}
                    </Show>
                  </div>
                </Show>
              }
            >
              <SkillEditor
                mode={mode()}
                detail={selectedDetail()}
                name={draftName()}
                description={draftDescription()}
                instructions={draftInstructions()}
                nameError={nameError()}
                isSaving={createMut.isLoading || updateMut.isLoading}
                onNameChange={setDraftName}
                onDescriptionChange={setDraftDescription}
                onInstructionsChange={setDraftInstructions}
                onCancel={cancelEditor}
                onSave={saveEditor}
              />
            </Show>
          </div>
        </Show>
      </div>
    </PageShell>
  );
}
