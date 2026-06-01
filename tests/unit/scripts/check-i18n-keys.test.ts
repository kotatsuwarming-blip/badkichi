import { describe, expect, it } from 'vitest'
// 純関数は .mjs (Node ESM) で実装し CLI と共有する。CLI は Node 22 でフラグ無し実行のため .mjs を採用。
import { collectKeyPaths, diffI18nKeys, isI18nKeysConsistent } from '../../../scripts/i18n-keys.mjs'

describe('collectKeyPaths', () => {
  it('ネストオブジェクトを deep key path (ドット連結) へ展開する', () => {
    const obj = {
      a: 'x',
      b: { c: 'y', d: { e: 'z' } }
    }
    expect(collectKeyPaths(obj).sort()).toEqual(['a', 'b.c', 'b.d.e'])
  })
})

describe('diffI18nKeys', () => {
  it('ja にのみ存在するキーがある場合 onlyInJa に検出する (fail 条件)', () => {
    const ja = { errors: { generic: '汎用', not_a_member: '非メンバー' } }
    const en = { errors: { generic: '' } }
    const { onlyInJa, onlyInEn } = diffI18nKeys(ja, en)
    expect(onlyInJa).toEqual(['errors.not_a_member'])
    expect(onlyInEn).toEqual([])
    expect(isI18nKeysConsistent(ja, en)).toBe(false)
  })

  it('en にのみ存在するキーがある場合 onlyInEn に検出する (fail 条件)', () => {
    const ja = { errors: { generic: '汎用' } }
    const en = { errors: { generic: '', extra: '' } }
    const { onlyInJa, onlyInEn } = diffI18nKeys(ja, en)
    expect(onlyInJa).toEqual([])
    expect(onlyInEn).toEqual(['errors.extra'])
    expect(isI18nKeysConsistent(ja, en)).toBe(false)
  })

  it('PG SQLSTATE ツリーの深いキー欠落を検出する (deep 比較の境界)', () => {
    const ja = { errors: { unique_violation: { generic: 'g', join_group: 'j', create_group: 'c' } } }
    const en = { errors: { unique_violation: { generic: '', create_group: '' } } } // join_group 欠落
    const { onlyInJa } = diffI18nKeys(ja, en)
    expect(onlyInJa).toEqual(['errors.unique_violation.join_group'])
    expect(isI18nKeysConsistent(ja, en)).toBe(false)
  })

  it('ja/en のキー構造が完全一致なら consistent (pass 条件)', () => {
    const ja = { errors: { generic: '汎用', unique_violation: { join_group: 'j' } } }
    const en = { errors: { generic: '', unique_violation: { join_group: '' } } }
    const { onlyInJa, onlyInEn } = diffI18nKeys(ja, en)
    expect(onlyInJa).toEqual([])
    expect(onlyInEn).toEqual([])
    expect(isI18nKeysConsistent(ja, en)).toBe(true)
  })
})
