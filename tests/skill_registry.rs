//! Integration tests for the SkillRegistry prototype.

use mini_claw::skills::SkillRegistry;

#[test]
fn empty_registry_resolve_returns_none() {
    let reg = SkillRegistry::new(None);
    assert!(
        reg.resolve("anything").is_none(),
        "resolve on empty registry should return None"
    );
}

#[test]
fn empty_registry_skill_description_returns_none() {
    let reg = SkillRegistry::new(None);
    assert!(
        reg.skill_description("missing").is_none(),
        "skill_description on unknown name should return None"
    );
}

#[test]
fn load_global_skills_no_dir_is_ok() {
    // With PINCHY_HOME pointing at an empty temp dir, loading should succeed
    // (no skills directory simply means zero skills).
    // Run from the temp dir so the repo-local `skills/global/` fallback
    // is also absent.
    let tmp = tempfile::tempdir().expect("tempdir");
    let orig_dir = std::env::current_dir().unwrap();
    unsafe { std::env::set_var("PINCHY_HOME", tmp.path()); }
    std::env::set_current_dir(tmp.path()).unwrap();

    let mut reg = SkillRegistry::new(None);
    let res = reg.load_global_skills();
    assert!(res.is_ok(), "missing skills dir should not error: {res:?}");
    assert!(reg.global_skills.is_empty());

    std::env::set_current_dir(orig_dir).unwrap();
    unsafe { std::env::remove_var("PINCHY_HOME"); }
}
