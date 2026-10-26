/* oxlint-disable import/no-default-export -- Mongoose plugins use default export */
import type { HydratedDocument, Model, Schema } from 'mongoose';

import { removeDiacritics } from './diacritics';

export type UrlSlugGenerator = (text: string, separator: string) => string;

export interface UrlSlugsOptions {
  field: string;
  addField: boolean;
  generator: UrlSlugGenerator;
  onHook: 'validate';
  separator: string;
  undefinedVal: string;
  maxLength: number | null;
  update: boolean;
  alwaysRecreate: boolean;
  index: boolean;
  indexType: typeof String;
  indexDefault: string;
  indexTrim: boolean;
  indexUnique: boolean;
  indexRequired: boolean;
  indexSparse: boolean;
}

export function defaultURLSlugGeneration(text: string, separator: string): string {
  let slug = text
    .toLowerCase()
    .replace(/([^a-z0-9\-_]+)/g, separator)
    .replace(new RegExp(`${separator}{2,}`, 'g'), separator);
  if (slug.endsWith(separator)) {
    slug = slug.slice(0, -1);
  }
  return slug;
}

const defaultOptions: UrlSlugsOptions = {
  field: 'slug',
  addField: true,
  generator: defaultURLSlugGeneration,
  onHook: 'validate',
  separator: '-',
  undefinedVal: 'undefined',
  maxLength: null,
  update: false,
  alwaysRecreate: false,
  index: true,
  indexType: String,
  indexDefault: '',
  indexTrim: true,
  indexUnique: true,
  indexRequired: false,
  indexSparse: false,
};

type SlugDoc = HydratedDocument<Record<string, unknown>>;

async function ensureUniqueSlugAsync(
  doc: SlugDoc,
  slug: string,
  options: UrlSlugsOptions,
): Promise<string> {
  if (!options.indexUnique) {
    return slug;
  }

  const model = doc.constructor as Model<Record<string, unknown>>;
  const slugLimited = Boolean(options.maxLength && slug.length === options.maxLength);
  const slugPrefix = slugLimited ? slug.slice(0, slug.length - 2) : slug;

  const q: Record<string, unknown> = {
    _id: { $ne: doc._id },
    [options.field]: new RegExp(`^${slugPrefix}`),
  };

  const docs = await model.find(q, { [options.field]: 1 }).exec();

  if (!docs.length) {
    return slug;
  }

  let max = docs.reduce((acc, existing) => {
    const docSlug = existing.get(options.field, String) as string;
    let count = 1;
    if (docSlug !== slug) {
      const match = docSlug.match(
        new RegExp(`${slugLimited ? slug.slice(0, slug.length - 2) : slug}${options.separator}([0-9]+)$`),
      );
      count = match ? parseInt(match[1] ?? '0', 10) + 1 : 0;
    }
    return count > acc ? count : acc;
  }, 0);

  if (max === 1) {
    max++;
  }

  const suffix = max === 0 ? '' : `${options.separator}${max}`;

  if (options.maxLength) {
    return slug.slice(0, options.maxLength - suffix.length) + suffix;
  }
  return slug + suffix;
}

function normalizeSlugFields(slugFields: string | string[]): string[] {
  if (typeof slugFields === 'string') {
    return slugFields.includes(' ') ? slugFields.split(' ') : [slugFields];
  }
  return slugFields;
}

function collectSlugInput(
  doc: SlugDoc,
  slugFields: string[],
  options: UrlSlugsOptions,
): { slugFieldsModified: boolean; slugFieldsSelected: boolean; toSlugify: string } {
  let slugFieldsSelected = true;
  let slugFieldsModified = doc.isNew;
  let toSlugify = '';

  if (slugFields.length > 1) {
    for (const slugField of slugFields) {
      if (!doc.isSelected(slugField)) {
        slugFieldsSelected = false;
      }
      if (doc.isModified(slugField)) {
        slugFieldsModified = true;
      }
      const slugPart = doc.get(slugField, String) as string | undefined;
      if (slugPart !== undefined) {
        toSlugify += `${slugPart} `;
      }
    }
    if (toSlugify.length) {
      toSlugify = toSlugify.slice(0, -1);
    } else {
      toSlugify = options.undefinedVal;
    }
  } else {
    const slugField = slugFields[0] ?? '';
    if (!doc.isSelected(slugField)) {
      slugFieldsSelected = false;
    }
    if (doc.isModified(slugField)) {
      slugFieldsModified = true;
    }
    const slugPart = doc.get(slugField, String) as string | undefined;
    if (slugPart !== undefined) {
      toSlugify += slugPart;
    }
    if (!toSlugify.length) {
      toSlugify = options.undefinedVal;
    }
  }

  return { slugFieldsModified, slugFieldsSelected, toSlugify };
}

export default function urlSlugs(
  slugFields: string | string[],
  options?: Partial<UrlSlugsOptions>,
): (schema: Schema) => void {
  const resolvedOptions: UrlSlugsOptions = { ...defaultOptions, ...options };
  const fields = normalizeSlugFields(slugFields);

  return (schema: Schema) => {
    if (resolvedOptions.addField) {
      schema.add({
        [resolvedOptions.field]: {
          type: resolvedOptions.indexType,
          default: resolvedOptions.indexDefault,
          trim: resolvedOptions.indexTrim,
          index: resolvedOptions.index,
          unique: resolvedOptions.indexUnique,
          required: resolvedOptions.indexRequired,
          sparse: resolvedOptions.indexSparse,
        },
      });
    }

    schema.methods.ensureUniqueSlug = function ensureUniqueSlug(
      slug: string,
      cb?: (err: Error | null | undefined, finalSlug?: string) => void,
    ): Promise<string> | void {
      const promise = ensureUniqueSlugAsync(this as SlugDoc, slug, resolvedOptions);
      if (typeof cb === 'function') {
        void promise.then(
          (finalSlug) => {
            cb(null, finalSlug);
          },
          (err: unknown) => {
            cb(err instanceof Error ? err : new Error(String(err)));
          },
        );
        return;
      }
      return promise;
    };

    schema.statics.findBySlug = function findBySlug(
      slug: string,
      fields?: Record<string, 0 | 1> | string,
      additionalOptions?: Record<string, unknown>,
      cb?: (err: Error | null | undefined, doc?: SlugDoc | null) => void,
    ) {
      const q: Record<string, unknown> = { [resolvedOptions.field]: slug };
      const query = this.findOne(q, fields, additionalOptions);
      if (typeof cb === 'function') {
        void query
          .exec()
          .then((doc: SlugDoc | null) => {
            cb(null, doc);
          })
          .catch((err: unknown) => {
            cb(err instanceof Error ? err : new Error(String(err)));
          });
        return query;
      }
      return query;
    };

    schema.pre('validate', async function urlSlugsPreHook(this: SlugDoc) {
      const currentSlug = this.get(resolvedOptions.field, String) as string;

      if (!this.isNew && !resolvedOptions.update && currentSlug) {
        return;
      }

      if (
        !this.isNew &&
        this.isModified(resolvedOptions.field) &&
        currentSlug &&
        !resolvedOptions.alwaysRecreate
      ) {
        return;
      }

      const { slugFieldsModified, slugFieldsSelected, toSlugify } = collectSlugInput(
        this,
        fields,
        resolvedOptions,
      );

      if (!slugFieldsSelected) {
        return;
      }

      if (!resolvedOptions.alwaysRecreate && !slugFieldsModified && currentSlug) {
        return;
      }

      let newSlug = resolvedOptions.generator(
        removeDiacritics(toSlugify),
        resolvedOptions.separator,
      );

      if (resolvedOptions.indexSparse && newSlug === resolvedOptions.undefinedVal) {
        this.set(resolvedOptions.field, undefined);
        this.markModified(resolvedOptions.field);
        return;
      }

      if (resolvedOptions.maxLength) {
        newSlug = newSlug.slice(0, resolvedOptions.maxLength);
      }

      const finalSlug = await ensureUniqueSlugAsync(this, newSlug, resolvedOptions);
      this.set(resolvedOptions.field, finalSlug);
      this.markModified(resolvedOptions.field);
    });
  };
}
