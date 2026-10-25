"""Train a logistic head on synthetic tones and write honest metrics.

The head does not choose HOME, REFER_SOON, or GO_NOW. Audio-driven referral escalation
is disabled: the score is experimental, display-only information and the protocol
ignores it. Nothing here is clinical performance.

Every recording carries a subject_id. Splits are made by subject (GroupShuffleSplit),
never by recording, because each synthetic subject contributes several recordings.
"""
import json
import wave
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, roc_auc_score
from sklearn.model_selection import GroupKFold, GroupShuffleSplit

from features import CLIP_SAMPLES, SAMPLE_RATE, extract_features, score

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
SEED = 20261024
N_SUBJECTS = 60
RECORDINGS_PER_SUBJECT = 4
TARGET_SPECIFICITY = 0.80
MODEL_VERSION = "synthetic-tones-logreg-v1"


def synth_clip(rng, subject, abnormal):
    """Two synthetic tone families. They are not coughs and not children."""
    t = np.arange(CLIP_SAMPLES) / SAMPLE_RATE
    f = subject["tone_hz"] * rng.uniform(0.97, 1.03)
    phase = subject["phase"] + rng.uniform(0, 0.4)
    if not abnormal:
        x = subject["amp"] * np.sin(2 * np.pi * f * t + phase)
        x += rng.normal(0, subject["noise"], CLIP_SAMPLES)
    else:
        x = subject["amp"] * np.sin(2 * np.pi * f * t + phase)
        x += 0.12 * np.sin(2 * np.pi * f * 2.15 * t)
        burst = ((t * subject["burst_hz"]) % 1.0) < 0.07
        x = x + burst * 0.28 * np.sin(2 * np.pi * min(f * 1.7, 3000) * t)
        x += rng.normal(0, subject["noise"], CLIP_SAMPLES)
    return np.clip(x, -0.95, 0.95)


def make_dataset(rng):
    clips, labels, subjects = [], [], []
    for s in range(N_SUBJECTS):
        abnormal = s % 2 == 1
        subject = {
            "noise": rng.uniform(0.004, 0.015),
            "amp": rng.uniform(0.15, 0.28) if abnormal else rng.uniform(0.04, 0.09),
            "tone_hz": rng.uniform(700, 1600) if abnormal else rng.uniform(90, 180),
            "phase": rng.uniform(0, 6.28),
            "burst_hz": rng.uniform(2.5, 4.5),
        }
        for _ in range(RECORDINGS_PER_SUBJECT):
            clips.append(synth_clip(rng, subject, abnormal))
            labels.append(int(abnormal))
            subjects.append(f"synthetic-subject-{s:03d}")
    return clips, np.array(labels), np.array(subjects)


def to_int16(x):
    return np.round(np.clip(x, -1, 32767 / 32768) * 32768).astype(np.int16)


def write_wav(path, x):
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SAMPLE_RATE)
        w.writeframes(to_int16(x).tobytes())


def subject_split(groups, test_size, seed):
    gss = GroupShuffleSplit(n_splits=1, test_size=test_size, random_state=seed)
    idx = np.arange(len(groups))
    a, b = next(gss.split(idx, groups=groups))
    return a, b


def choose_threshold(y, s):
    best = None
    for thr in np.unique(s):
        pred = s >= thr
        tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
        spec = tn / (tn + fp) if tn + fp else 0.0
        sens = tp / (tp + fn) if tp + fn else 0.0
        if spec >= TARGET_SPECIFICITY and (best is None or sens > best[1] or (sens == best[1] and thr > best[0])):
            best = (float(thr), sens, spec)
    if best is not None:
        return best[0], f"highest validation sensitivity with specificity >= {TARGET_SPECIFICITY}"
    youden = max(np.unique(s), key=lambda thr: _youden(y, s >= thr))
    return float(youden), "best Youden index (no threshold reached the target specificity)"


def _youden(y, pred):
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return tp / (tp + fn) + tn / (tn + fp) - 1


def report(y, s, thr):
    pred = s >= thr
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    return {
        "auroc": round(float(roc_auc_score(y, s)), 4),
        "sensitivityAtThreshold": round(tp / (tp + fn), 4),
        "specificityAtThreshold": round(tn / (tn + fp), 4),
        "confusionMatrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }


def main():
    rng = np.random.default_rng(SEED)
    clips, y, groups = make_dataset(rng)
    if any(g is None or g == "" for g in groups):
        raise SystemExit("Every recording needs a subject_id; refusing to split by recording.")

    X = np.stack([extract_features(to_int16(c) / 32768.0) for c in clips])

    trval, test = subject_split(groups, 0.2, SEED)
    tr_rel, val_rel = subject_split(groups[trval], 0.25, SEED + 1)
    train, val = trval[tr_rel], trval[val_rel]

    sets = {"train": set(groups[train]), "validation": set(groups[val]), "test": set(groups[test])}
    overlap = (sets["train"] & sets["validation"]) | (sets["train"] & sets["test"]) | (sets["validation"] & sets["test"])
    assert not overlap, f"subject leakage across splits: {sorted(overlap)}"

    mean = X[train].mean(axis=0)
    std = X[train].std(axis=0)
    std_safe = np.where(std > 0, std, 1.0)
    clf = LogisticRegression(C=0.1, max_iter=5000)
    clf.fit((X[train] - mean) / std_safe, y[train])

    head = {
        "modelVersion": MODEL_VERSION,
        "experimental": True,
        "usedForReferral": False,
        "featureMean": mean.tolist(),
        "featureStd": std.tolist(),
        "weights": clf.coef_[0].tolist(),
        "bias": float(clf.intercept_[0]),
    }
    s_all = np.array([score(x, head) for x in X])

    thr, rule = choose_threshold(y[val], s_all[val])
    tau_high = round(float(thr), 6)
    selection = (
        "On the validation subjects, pick a threshold with specificity >= 0.80 if possible "
        "(highest sensitivity, then the higher threshold); otherwise the best Youden index. "
        + rule
        + ". Chosen on validation subjects only. High AUROC on this file is separation of synthetic tones only, not clinical performance."
    )

    cv_aurocs = []
    for f_tr, f_te in GroupKFold(n_splits=5).split(X[trval], y[trval], groups[trval]):
        tr_idx, te_idx = trval[f_tr], trval[f_te]
        assert not (set(groups[tr_idx]) & set(groups[te_idx])), "subject leakage inside cross-validation"
        m, sd = X[tr_idx].mean(axis=0), X[tr_idx].std(axis=0)
        sd = np.where(sd > 0, sd, 1.0)
        c = LogisticRegression(C=0.1, max_iter=5000).fit((X[tr_idx] - m) / sd, y[tr_idx])
        cv_aurocs.append(float(roc_auc_score(y[te_idx], c.predict_proba((X[te_idx] - m) / sd)[:, 1])))
    metrics = {
        "limitationsFirst": [
            "Synthetic tones only: generated noise bursts, tones and clicks.",
            "Not children. Not phone-recorded cough. No real recordings of any kind.",
            "A high AUROC here is separation of synthetic tones only. It is not clinical performance.",
            "Experimental audio score - information only. Audio-driven referral escalation is disabled; the score never changes HOME, REFER_SOON, or GO_NOW.",
            "COUGHVID and Coswara (CC BY 4.0) were not downloaded. ICBHI 2017 was not used.",
        ],
        "modelVersion": MODEL_VERSION,
        "usedForReferral": False,
        "dataNote": "LOUD LIMIT: this is synthetic tones, not children, and not clinical performance. A high AUROC is separation of synthetic tones only. Generated by ml/train.py (seed %d). COUGHVID and Coswara (both CC BY 4.0) were not downloaded or used. ICBHI 2017 was not used. SPRSound is pediatric stethoscope lung-sound audio, not phone cough; any SPRSound result would be stethoscope lung-sound results, not phone-cough validation, and would also need patient-level splits." % SEED,
        "split": {
            "method": "GroupShuffleSplit on subject_id (test 20% of subjects, then validation 25% of the remaining subjects)",
            "unit": "subject",
            "recordingLevelSplitUsed": False,
            "subjectOverlap": 0,
            "subjects": {k: len(v) for k, v in sets.items()},
            "recordings": {"train": int(len(train)), "validation": int(len(val)), "test": int(len(test))},
            "subjectIds": {k: sorted(v) for k, v in sets.items()},
        },
        "thresholdSelection": {
            "rule": selection,
            "chosenOn": "validation subjects",
            "specificityTarget": TARGET_SPECIFICITY,
            "value": tau_high,
            "appliedRule": rule,
        },
        "experimentalResearchThreshold": {
            "value": tau_high,
            "selectionRule": selection,
            "usedByDecision": False,
        },
        "stabilityNote": "Only 12 subjects per held-out split, so single-split numbers swing widely. Read the grouped cross-validation spread, not one number.",
        "groupedCrossValidation": {
            "method": "GroupKFold (5 folds) on subject_id over train+validation subjects",
            "aurocPerFold": [round(a, 4) for a in cv_aurocs],
            "aurocMean": round(float(np.mean(cv_aurocs)), 4),
            "aurocStd": round(float(np.std(cv_aurocs)), 4),
        },
        "validation": report(y[val], s_all[val], thr),
        "test": report(y[test], s_all[test], thr),
    }

    (ROOT / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    for out in [ROOT / "export" / "head.json", REPO / "apps" / "web" / "public" / "models" / "head.json"]:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(head) + "\n")
    web_metrics = REPO / "apps" / "web" / "public" / "models" / "metrics.json"
    web_metrics.write_text(json.dumps(metrics, indent=2) + "\n")

    golden_rng = np.random.default_rng(7)
    golden_subject = {"noise": 0.01, "amp": 0.2, "tone_hz": 900.0, "phase": 0.3, "burst_hz": 3.0}
    golden = synth_clip(golden_rng, golden_subject, True)
    write_wav(ROOT / "fixtures" / "golden.wav", golden)
    golden_samples = to_int16(golden) / 32768.0
    gf = extract_features(golden_samples)
    (ROOT / "fixtures" / "golden.json").write_text(
        json.dumps({"features": gf.tolist(), "score": score(gf, head), "modelVersion": MODEL_VERSION}) + "\n"
    )

    demo_subject = {"noise": 0.008, "amp": 0.06, "tone_hz": 140.0, "phase": 1.0, "burst_hz": 3.0}
    demo = synth_clip(np.random.default_rng(11), demo_subject, False)
    write_wav(REPO / "apps" / "web" / "public" / "audio" / "samples" / "synthetic-demo-cough.wav", demo)

    print(json.dumps({k: metrics[k] for k in ["split", "experimentalResearchThreshold", "validation", "test"]}, indent=2)[:2500])


if __name__ == "__main__":
    main()
