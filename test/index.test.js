const { expect } = require('chai');
const mongoose = require('mongoose');
const urlSlugs = require('../dist/src/index.js').default;

const maxLength = 20;

const TestObjSchema = new mongoose.Schema({ name: String, extra: String });
const TestObjSparseSchema = new mongoose.Schema({ name: String, extra: String });

TestObjSchema.plugin(urlSlugs('name', { maxLength }));
TestObjSparseSchema.plugin(urlSlugs('name', { maxLength, indexSparse: true }));

const TestObj = mongoose.model('test_obj_v2', TestObjSchema);
const TestSparseObj = mongoose.model('test_sparse_obj_v2', TestObjSparseSchema);

describe('mongoose-url-slugs', function () {
  before(async function () {
    const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1/mongoose-url-slugs-test';
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(uri);
    }
    await TestObj.deleteMany({});
    await TestSparseObj.deleteMany({});
  });

  after(async function () {
    await mongoose.disconnect();
  });

  describe('maxLength', function () {
    it('ensures slug length is less than maxLength', async function () {
      const obj = await TestObj.create({
        name: 'super duper long content that cannot possibly fit into a url in any meaningful manner',
      });
      expect(obj.slug).length(maxLength);
    });

    it('sequential slugs work with maxLength', async function () {
      const obj = await TestObj.create({
        name: 'super duper long content that cannot possibly fit into a url',
      });
      expect(obj.slug).length(maxLength);
      const obj2 = await TestObj.create({
        name: 'super duper long content that cannot possibly fit into a url',
      });
      expect(obj2.slug).length(maxLength);
    });
  });

  describe('slug numbering', function () {
    it('does not add unnecessary numbers', async function () {
      const obj = await TestObj.create({ name: 'Foo Bar' });
      expect(obj.slug).to.equal('foo-bar');
      const obj2 = await TestObj.create({ name: 'Foo' });
      expect(obj2.slug).to.equal('foo');
      expect(obj._id.equals(obj2._id)).to.equal(false);
    });
  });

  describe('slug', function () {
    it('does not use undefined when slug field was not selected and document was saved', async function () {
      const obj = await TestObj.create({ name: 'selected', extra: 'test' });
      expect(obj.slug).to.equal('selected');
      const obj2 = await TestObj.findOne({ name: 'selected' }).select('extra');
      expect(obj2).to.exist;
      obj2.extra = 'test2';
      await obj2.save();
      const obj4 = await TestObj.findOne({ name: 'selected' });
      expect(obj4.extra).to.equal('test2');
      expect(obj4.slug).to.equal('selected');
    });

    it('uses undefined when slug field does not exist but was selected', async function () {
      const obj = await TestObj.create({ extra: 'test' });
      expect(obj.slug).to.equal('undefined');
      const obj2 = await TestObj.create({ extra: 'test2' });
      expect(obj2.slug).to.equal('undefined-2');
      expect(obj._id.equals(obj2._id)).to.equal(false);
    });

    it('sets slug to undefined when it is an empty string and was selected', async function () {
      const obj = await TestObj.create({ name: '' });
      expect(obj.slug).to.equal('undefined-3');
    });
  });

  describe('index_sparse', function () {
    it('sets slug to null when it is an empty string', async function () {
      const obj = await TestSparseObj.create({ name: '' });
      expect(obj.slug).to.be.oneOf([undefined, null, '']);
      const obj2 = await TestSparseObj.create({ name: '' });
      expect(obj2.slug).to.be.oneOf([undefined, null, '']);
      expect(obj._id.equals(obj2._id)).to.equal(false);
    });
  });

  it('works', async function () {
    const obj = await TestObj.create({ name: 'cool stuff' });
    expect(obj.slug).to.equal('cool-stuff');
    const obj2 = await TestObj.create({ name: 'cool stuff' });
    expect(obj2.slug).to.equal('cool-stuff-2');
    const obj3 = await TestObj.create({ name: 'cool stuff' });
    expect(obj3.slug).to.equal('cool-stuff-3');
  });
});
