import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import mongoose, { type HydratedDocument, type Model } from 'mongoose'
import urlSlugs from '../src/index.js'

const maxLength = 20

interface SlugAttrs {
  extra?: string
  name?: string
  slug?: string
}

const TestObjSchema = new mongoose.Schema<SlugAttrs>({ name: String, extra: String })
const TestObjSparseSchema = new mongoose.Schema<SlugAttrs>({ name: String, extra: String })

TestObjSchema.plugin(urlSlugs('name', { maxLength }))
TestObjSparseSchema.plugin(urlSlugs('name', { maxLength, indexSparse: true }))

const TestObj: Model<SlugAttrs> = mongoose.model<SlugAttrs>('test_obj_v2', TestObjSchema)
const TestSparseObj: Model<SlugAttrs> = mongoose.model<SlugAttrs>(
  'test_sparse_obj_v2',
  TestObjSparseSchema,
)

function assertEmptySlug(slug: string | null | undefined): void {
  assert.ok(slug === undefined || slug === null || slug === '')
}

describe('mongoose-url-slugs', () => {
  before(async () => {
    const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1/mongoose-url-slugs-test'
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri)
    }
    await TestObj.deleteMany({})
    await TestSparseObj.deleteMany({})
  })

  after(async () => {
    await mongoose.disconnect()
  })

  describe('maxLength', () => {
    it('ensures slug length is less than maxLength', async () => {
      const obj = await TestObj.create({
        name: 'super duper long content that cannot possibly fit into a url in any meaningful manner',
      })
      assert.equal(obj.slug?.length, maxLength)
    })

    it('sequential slugs work with maxLength', async () => {
      const obj = await TestObj.create({
        name: 'super duper long content that cannot possibly fit into a url',
      })
      assert.equal(obj.slug?.length, maxLength)
      const obj2 = await TestObj.create({
        name: 'super duper long content that cannot possibly fit into a url',
      })
      assert.equal(obj2.slug?.length, maxLength)
    })
  })

  describe('slug numbering', () => {
    it('does not add unnecessary numbers', async () => {
      const obj = await TestObj.create({ name: 'Foo Bar' })
      assert.equal(obj.slug, 'foo-bar')
      const obj2 = await TestObj.create({ name: 'Foo' })
      assert.equal(obj2.slug, 'foo')
      assert.equal(obj._id.equals(obj2._id), false)
    })
  })

  describe('slug', () => {
    it('does not use undefined when slug field was not selected and document was saved', async () => {
      const obj = await TestObj.create({ name: 'selected', extra: 'test' })
      assert.equal(obj.slug, 'selected')
      const obj2: HydratedDocument<SlugAttrs> | null = await TestObj.findOne({
        name: 'selected',
      }).select('extra')
      assert.ok(obj2)
      obj2.extra = 'test2'
      await obj2.save()
      const obj4 = await TestObj.findOne({ name: 'selected' })
      assert.ok(obj4)
      assert.equal(obj4.extra, 'test2')
      assert.equal(obj4.slug, 'selected')
    })

    it('uses undefined when slug field does not exist but was selected', async () => {
      const obj = await TestObj.create({ extra: 'test' })
      assert.equal(obj.slug, 'undefined')
      const obj2 = await TestObj.create({ extra: 'test2' })
      assert.equal(obj2.slug, 'undefined-2')
      assert.equal(obj._id.equals(obj2._id), false)
    })

    it('sets slug to undefined when it is an empty string and was selected', async () => {
      const obj = await TestObj.create({ name: '' })
      assert.equal(obj.slug, 'undefined-3')
    })
  })

  describe('index_sparse', () => {
    it('sets slug to null when it is an empty string', async () => {
      const obj = await TestSparseObj.create({ name: '' })
      assertEmptySlug(obj.slug)
      const obj2 = await TestSparseObj.create({ name: '' })
      assertEmptySlug(obj2.slug)
      assert.equal(obj._id.equals(obj2._id), false)
    })
  })

  it('works', async () => {
    const obj = await TestObj.create({ name: 'cool stuff' })
    assert.equal(obj.slug, 'cool-stuff')
    const obj2 = await TestObj.create({ name: 'cool stuff' })
    assert.equal(obj2.slug, 'cool-stuff-2')
    const obj3 = await TestObj.create({ name: 'cool stuff' })
    assert.equal(obj3.slug, 'cool-stuff-3')
  })
})
