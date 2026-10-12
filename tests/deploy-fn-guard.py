# -*- coding: utf-8 -*-
"""tools/deploy-fn.py 의 판단 함수 시험 — 준비물 없음(표준 라이브러리 unittest). preflight [5] 가 부른다.

    python tests/deploy-fn-guard.py

git·supabase 는 부르지 않는다(순수 함수만). 실제 배포 명령은 어떤 경우에도 안 돈다.
(이 저장소의 다른 시험은 node --test 지만, 가드가 파이썬이라 시험도 파이썬이다 — 성경암송 tests/deploy-fn-guard.py 와 같은 꼴.)
"""
import importlib.util, os, sys, unittest

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

sys.dont_write_bytecode = True
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location("deploy_fn", os.path.join(ROOT, "tools", "deploy-fn.py"))
D = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(D)

FN = "supabase/functions/church-admin"


def levels(msgs):
    return [lv for lv, _ in msgs]


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


class Judge(unittest.TestCase):
    def test_clean_same_passes_both(self):
        for env in ("dev", "prod"):
            ok, msgs = D.judge(env, [], [], [], [], False)
            self.assertTrue(ok)
            self.assertEqual(levels(msgs), ["통과"])

    def test_dirty_blocks_both_even_with_allow_ahead(self):
        dirty = [(" M", FN + "/index.ts")]
        self.assertFalse(D.judge("dev", dirty, [], [], [], True)[0])
        self.assertFalse(D.judge("prod", dirty, [], [], [], False)[0])

    def test_untracked_blocks(self):
        ok, msgs = D.judge("dev", [("??", FN + "/x.ts")], [], [], [], True)
        self.assertFalse(ok)
        self.assertIn("x.ts", msgs[0][1])

    def test_dirty_config_blocks(self):
        self.assertFalse(D.judge("dev", [(" M", "supabase/config.toml")], [], [], [], True)[0])

    def test_ahead_prod_blocks(self):
        ok, _ = D.judge("prod", [], [FN + "/index.ts"], [], [], False)
        self.assertFalse(ok)

    def test_ahead_dev_needs_flag(self):
        self.assertFalse(D.judge("dev", [], [FN + "/index.ts"], [], [], False)[0])
        ok, msgs = D.judge("dev", [], [FN + "/index.ts"], [], [], True)
        self.assertTrue(ok)
        self.assertEqual(levels(msgs), ["경고"])

    def test_behind_blocks_even_dev_with_flag(self):
        behind = ["abc1234 feat(봉사 당번): 👥 봉사자"]
        ok, msgs = D.judge("dev", [], [FN + "/index.ts"], behind, [], True)
        self.assertFalse(ok)
        self.assertIn("뒤처졌다", "".join(m for _, m in msgs))

    def test_missing_actions_named(self):
        f = [FN + "/index.ts"]
        ok, msgs = D.judge("prod", [], f, [], ["dutyPeople", "eduList"], False)
        self.assertFalse(ok)
        text = "".join(m for _, m in msgs)
        self.assertIn("dutyPeople", text)
        self.assertIn("eduList", text)
        # 개발 · 플래그 없음 → 막음
        self.assertFalse(D.judge("dev", [], f, [], ["dutyPeople"], False)[0])
        # 개발 · --allow-ahead · 뒤처지지 않음 → 일부러 지운 것으로 보고 경고만
        ok, msgs = D.judge("dev", [], f, [], ["dutyPeople"], True)
        self.assertTrue(ok)
        self.assertEqual(levels(msgs), ["경고", "경고"])
        # 개발 · --allow-ahead 라도 뒤처졌으면 → 막음
        self.assertFalse(D.judge("dev", [], f, ["abc feat"], ["dutyPeople"], True)[0])

    def test_gaps_warn_only(self):
        ok, msgs = D.judge("prod", [], [], [], [], False, (["newThing"], []))
        self.assertTrue(ok)
        self.assertEqual(levels(msgs), ["경고"])
        self.assertIn("newThing", msgs[0][1])
        ok, msgs = D.judge("prod", [], [], [], [], False, ([], []))
        self.assertEqual(levels(msgs), ["통과"])


class Parse(unittest.TestCase):
    def test_porcelain(self):
        out = " M supabase/functions/church-admin/index.ts\0?? supabase/functions/church-admin/new.ts\0R  b.ts\0a.ts\0"
        self.assertEqual(D.parse_porcelain(out), [
            (" M", "supabase/functions/church-admin/index.ts"),
            ("??", "supabase/functions/church-admin/new.ts"),
            ("R ", "b.ts"),
        ])
        self.assertEqual(D.parse_porcelain(""), [])

    def test_case_actions_many_per_line(self):
        src = '''switch (action) {
      case "me":               return json(await me(ctx));
      case "stats": case "participants": case "verses":
        const s = 'case "notAction":';
      // case "commented": 은 줄 머리가 // 라 안 센다
      case "eduApply" : {
    }'''
        self.assertEqual(D.case_actions(src), {"me", "stats", "participants", "verses", "eduApply"})
        self.assertEqual(D.case_actions(None), set())

    def test_role_keys(self):
        src = '''const DUTY_BOTH = ["duty", "dutylead"];
export const ACTION_ROLES: Record<string, string | string[] | null> = {
  me: null,
  membersList: "super",   // 주석의 fake: 는 안 센다
  // commentKey: "super",
  stats: "memorizeadmin", participants: "memorizeadmin",
  dutyPeople: DUTY_BOTH,
  "quoted": "x",
};
export const OTHER = { notAction: 1 };'''
        self.assertEqual(D.role_keys(src), {"me", "membersList", "stats", "participants", "dutyPeople", "quoted"})
        self.assertEqual(D.role_keys("const x = 1;"), set())
        self.assertEqual(D.role_keys(None), set())

    def test_route_gaps_skip_internal(self):
        self.assertEqual(D.route_gaps({"a", "b"}, {"a", "c", "internalMyHistory"}), (["b"], ["c"]))
        self.assertEqual(D.route_gaps({"a"}, {"a", "internalPinMatch"}), ([], []))

    def test_relative_imports(self):
        src = '''import { a } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { canCall } from "./authz.ts";
export * from './util.ts';
const m = await import("./lazy.ts");'''
        self.assertEqual(D.relative_imports(src, FN + "/index.ts"), [
            "supabase/functions/_shared/cors.ts",
            FN + "/authz.ts",
            FN + "/lazy.ts",
            FN + "/util.ts",
        ])


class RealFiles(unittest.TestCase):
    """지금 판의 진짜 파일 — 라우팅 꼴이 바뀌어 가드가 0개를 세는 일을 여기서 먼저 잡는다."""

    def test_real_counts_and_agreement(self):
        cases = D.case_actions(read(FN + "/index.ts"))
        roles = D.role_keys(read(FN + "/authz.ts"))
        self.assertIn("me", cases)
        self.assertIn("internalMyHistory", cases)          # 내부 키 갈래도 센다
        self.assertGreater(len(cases), 150)
        self.assertGreater(len(roles), 150)
        self.assertIn("blessingUsage", roles)              # 한 줄에 여럿 쓴 열쇠
        self.assertIn("blessingUsage", cases)              # 한 줄에 여럿 쓴 case
        # 문과 갈래가 맞는다(CLAUDE.md 「⚠️ 함정」 — 새 액션 = ACTION_ROLES + case + PROBE)
        self.assertEqual(D.route_gaps(roles, cases), ([], []))


if __name__ == "__main__":
    unittest.main(verbosity=1)
