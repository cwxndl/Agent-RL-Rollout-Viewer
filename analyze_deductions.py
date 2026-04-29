#!/usr/bin/env python3
"""Parse deductions files and produce analysis across training steps."""

import re
import json
from collections import defaultdict, Counter

def parse_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    entries = []
    # Split by "## 源文件"
    blocks = re.split(r'^## 源文件：', content, flags=re.MULTILINE)
    
    for block in blocks[1:]:  # skip header
        entry = {}
        
        # Extract question
        q_match = re.search(r'- \*\*question\*\*：(.+)', block)
        if q_match:
            entry['question'] = q_match.group(1).strip()
        
        # Extract request_id
        rid_match = re.search(r'- \*\*request_id\*\*：(\w+)', block)
        if rid_match:
            entry['request_id'] = rid_match.group(1)
        
        # Extract scores
        score_match = re.search(
            r'- \*\*score\*\*：([\d.]+)\s*\|\s*\*\*trajectory\*\*：([\d.]+)\s*\|\s*\*\*answer\*\*：([\d.]+)\s*\|\s*\*\*final_reward\*\*：([\d.]+)',
            block
        )
        if score_match:
            entry['score'] = float(score_match.group(1))
            entry['trajectory'] = float(score_match.group(2))
            entry['answer'] = float(score_match.group(3))
            entry['final_reward'] = float(score_match.group(4))
        
        # Extract all deduction blocks
        deduction_blocks = re.findall(r'<deductions>(.*?)</deductions>', block, re.DOTALL)
        
        entry['deductions'] = []
        entry['deduction_details'] = []
        for db in deduction_blocks:
            if 'None.' in db and 'Total deductions: 0' in db:
                continue
            # Extract individual deductions
            dims = re.findall(r'- Dimension:\s*(.+)', db)
            rules = re.findall(r'- Rule:\s*(.+)', db)
            evidences = re.findall(r'- Evidence:\s*(.+)', db)
            points = re.findall(r'- Points:\s*(.+)', db)
            
            for i in range(len(dims)):
                d = {
                    'dimension': dims[i].strip() if i < len(dims) else '',
                    'rule': rules[i].strip() if i < len(rules) else '',
                    'evidence': evidences[i].strip() if i < len(evidences) else '',
                    'points': points[i].strip() if i < len(points) else ''
                }
                entry['deductions'].append(d['dimension'] + ': ' + d['rule'])
                entry['deduction_details'].append(d)
        
        if 'question' in entry:
            entries.append(entry)
    
    return entries


def main():
    files = {
        20: 'deductions_step_20_validate_all.txt',
        40: 'deductions_step_40_validate_all.txt',
        60: 'deductions_step_60_validate_all.txt',
    }
    
    data = {}
    for step, fp in files.items():
        data[step] = parse_file(fp)
    
    # --- 1. Overall stats ---
    print("=" * 80)
    print("1. 总体统计")
    print("=" * 80)
    for step in [20, 40, 60]:
        entries = data[step]
        scores = [e['score'] for e in entries if 'score' in e]
        traj_scores = [e['trajectory'] for e in entries if 'trajectory' in e]
        ans_scores = [e['answer'] for e in entries if 'answer' in e]
        perfect = sum(1 for s in scores if s >= 1.0)
        zero = sum(1 for s in scores if s <= 0)
        has_ded = sum(1 for e in entries if len(e['deductions']) > 0)
        
        print(f"\nStep {step}: {len(entries)} 条")
        print(f"  平均 score: {sum(scores)/len(scores):.3f}")
        print(f"  平均 trajectory: {sum(traj_scores)/len(traj_scores):.1f}")
        print(f"  平均 answer: {sum(ans_scores)/len(ans_scores):.1f}")
        print(f"  满分(score=1): {perfect} ({perfect/len(scores)*100:.1f}%)")
        print(f"  零分(score=0): {zero} ({zero/len(scores)*100:.1f}%)")
        print(f"  有扣分: {has_ded} ({has_ded/len(entries)*100:.1f}%)")

    # --- 2. Deduction dimension/rule frequency ---
    print("\n" + "=" * 80)
    print("2. 扣分维度/规则频次 (按 step)")
    print("=" * 80)
    
    all_rules = set()
    rule_counts = {}
    for step in [20, 40, 60]:
        counter = Counter()
        for e in data[step]:
            for d in e['deductions']:
                counter[d] += 1
                all_rules.add(d)
        rule_counts[step] = counter
    
    # Sort by total frequency
    rule_totals = Counter()
    for r in all_rules:
        for step in [20, 40, 60]:
            rule_totals[r] += rule_counts[step].get(r, 0)
    
    print(f"\n{'扣分规则':<80} | Step20 | Step40 | Step60 | 趋势")
    print("-" * 120)
    for rule, total in rule_totals.most_common(30):
        c20 = rule_counts[20].get(rule, 0)
        c40 = rule_counts[40].get(rule, 0)
        c60 = rule_counts[60].get(rule, 0)
        if c60 > c20:
            trend = "↑恶化"
        elif c60 < c20:
            trend = "↓改善"
        else:
            trend = "→持平"
        print(f"  {rule:<78} | {c20:>6} | {c40:>6} | {c60:>6} | {trend}")

    # --- 3. Dimension-level aggregation ---
    print("\n" + "=" * 80)
    print("3. 按扣分大类(Dimension)聚合")
    print("=" * 80)
    
    for step in [20, 40, 60]:
        dim_counter = Counter()
        for e in data[step]:
            for d in e['deduction_details']:
                dim_counter[d['dimension']] += 1
        print(f"\nStep {step}:")
        for dim, cnt in dim_counter.most_common():
            print(f"  {dim}: {cnt}")

    # --- 4. Match questions across steps by question text ---
    print("\n" + "=" * 80)
    print("4. 按问句匹配跨步骤变化 (question text)")
    print("=" * 80)
    
    q_map = defaultdict(dict)  # question -> {step: entry}
    for step in [20, 40, 60]:
        for e in data[step]:
            q = e['question']
            q_map[q][step] = e
    
    # Find questions present in all 3 steps
    common_qs = [q for q, d in q_map.items() if len(d) == 3]
    print(f"\n三步骤共有问句: {len(common_qs)}")
    
    # Categorize
    improved = []  # score improved from step 20 to 60
    worsened = []  # score worsened
    stable_good = []  # always good
    stable_bad = []  # always bad
    
    for q in common_qs:
        s20 = q_map[q][20]['score']
        s40 = q_map[q][40]['score']
        s60 = q_map[q][60]['score']
        
        if s60 > s20 + 0.05:
            improved.append((q, s20, s40, s60))
        elif s60 < s20 - 0.05:
            worsened.append((q, s20, s40, s60))
        elif s20 >= 0.95 and s60 >= 0.95:
            stable_good.append((q, s20, s40, s60))
        elif s20 <= 0.05 and s60 <= 0.05:
            stable_bad.append((q, s20, s40, s60))
    
    print(f"改善: {len(improved)}, 恶化: {len(worsened)}, 稳定好: {len(stable_good)}, 稳定差: {len(stable_bad)}")
    
    print(f"\n--- 恶化的问句 (score下降 >=0.05) ---")
    worsened.sort(key=lambda x: x[1] - x[3], reverse=True)
    for q, s20, s40, s60 in worsened[:20]:
        print(f"  [{s20:.2f} → {s40:.2f} → {s60:.2f}] {q[:100]}")
        # Show deductions at step 60
        if 60 in q_map[q]:
            for d in q_map[q][60]['deduction_details'][:3]:
                print(f"    扣分@60: [{d['dimension']}] {d['rule']}")
                print(f"             {d['evidence'][:150]}")
    
    print(f"\n--- 改善的问句 (score上升 >=0.05) ---")
    improved.sort(key=lambda x: x[3] - x[1], reverse=True)
    for q, s20, s40, s60 in improved[:20]:
        print(f"  [{s20:.2f} → {s40:.2f} → {s60:.2f}] {q[:100]}")
    
    print(f"\n--- 持续低分问句 (所有step score=0) ---")
    for q, s20, s40, s60 in stable_bad[:20]:
        print(f"  [{s20:.2f} → {s40:.2f} → {s60:.2f}] {q[:100]}")
        for d in q_map[q][60]['deduction_details'][:3]:
            print(f"    扣分@60: [{d['dimension']}] {d['rule']}")
            print(f"             {d['evidence'][:200]}")

    # --- 5. Trajectory vs Answer deduction source ---
    print("\n" + "=" * 80)
    print("5. 扣分来源: trajectory vs answer")
    print("=" * 80)
    for step in [20, 40, 60]:
        traj_fail = sum(1 for e in data[step] if 'trajectory' in e and e['trajectory'] < 100)
        ans_fail = sum(1 for e in data[step] if 'answer' in e and e['answer'] < 100)
        both_fail = sum(1 for e in data[step] if 'trajectory' in e and 'answer' in e and e['trajectory'] < 100 and e['answer'] < 100)
        total = len(data[step])
        print(f"\nStep {step}:")
        print(f"  trajectory扣分: {traj_fail} ({traj_fail/total*100:.1f}%)")
        print(f"  answer扣分: {ans_fail} ({ans_fail/total*100:.1f}%)")
        print(f"  两者都扣: {both_fail} ({both_fail/total*100:.1f}%)")

    # --- 6. Score distribution ---
    print("\n" + "=" * 80)
    print("6. Score 分布")
    print("=" * 80)
    for step in [20, 40, 60]:
        scores = [e['score'] for e in data[step] if 'score' in e]
        buckets = defaultdict(int)
        for s in scores:
            bucket = round(s * 10) / 10  # round to 0.1
            buckets[bucket] += 1
        print(f"\nStep {step}:")
        for b in sorted(buckets.keys()):
            bar = '█' * buckets[b]
            print(f"  {b:.1f}: {buckets[b]:>3} {bar}")

    # --- 7. Top evidence patterns for persistent issues ---
    print("\n" + "=" * 80)
    print("7. Step60 高频扣分证据关键词分析")
    print("=" * 80)
    evidence_keywords = Counter()
    for e in data[60]:
        for d in e['deduction_details']:
            ev = d['evidence'].lower()
            # Extract meaningful patterns
            for kw in ['hallucination', 'tool misuse', 'wrong tool', 'wrong ticker',
                       'price target', 'average price', 'closing_price', 'sma', 'moving average',
                       'date', 'currency', 'unit', 'not supported', 'no recovery',
                       'footnote', 'citation', 'source', 'markdown', 'formatting',
                       'language', 'chinese', 'english', 'spanish',
                       'unnecessary tool', 'redundant', 'extra call',
                       'incomplete', 'missing', 'omit', 'partial',
                       'stale', 'outdated', 'cached']:
                if kw in ev:
                    evidence_keywords[kw] += 1
    
    print("\nStep60 扣分证据关键词:")
    for kw, cnt in evidence_keywords.most_common(20):
        print(f"  {kw}: {cnt}")

    # Output structured JSON for further use
    summary = {
        'overall': {},
        'rule_trends': [],
        'worsened_questions': [],
        'stable_bad_questions': [],
    }
    
    for step in [20, 40, 60]:
        scores = [e['score'] for e in data[step] if 'score' in e]
        summary['overall'][f'step_{step}'] = {
            'count': len(scores),
            'avg_score': round(sum(scores)/len(scores), 3),
            'perfect_pct': round(sum(1 for s in scores if s >= 1.0)/len(scores)*100, 1),
            'zero_pct': round(sum(1 for s in scores if s <= 0)/len(scores)*100, 1),
        }
    
    for rule, total in rule_totals.most_common(20):
        summary['rule_trends'].append({
            'rule': rule,
            'step_20': rule_counts[20].get(rule, 0),
            'step_40': rule_counts[40].get(rule, 0),
            'step_60': rule_counts[60].get(rule, 0),
        })
    
    with open('deduction_analysis.json', 'w') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    
    print("\n\n分析完成！JSON 摘要已保存到 deduction_analysis.json")


if __name__ == '__main__':
    main()
