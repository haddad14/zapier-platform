'use strict';

const util = require('util');

const _ = require('lodash');
const toc = require('markdown-toc');

const packageJson = require('../../package.json');
const links = require('./links');

const NO_DESCRIPTION = '_No description given._';
const COMBOS = ['anyOf', 'allOf', 'oneOf'];
const { SKIP_KEY } = require('../constants');

const walkSchemas = (InitSchema, callback) => {
  const recurse = (Schema, parents) => {
    parents = parents || [];
    callback(Schema, parents);
    Schema.dependencies.map(childSchema => {
      const newParents = parents.concat([InitSchema]);
      recurse(childSchema, newParents);
    });
  };
  recurse(InitSchema);
};

const collectSchemas = InitSchema => {
  const schemas = {};
  walkSchemas(InitSchema, Schema => {
    schemas[Schema.id] = Schema;
  });
  return schemas;
};

const quoteOrNa = val => (val ? `\`${val.replace('`', '')}\`` : '_n/a_');

const formatExample = example => {
  const ex = _.isPlainObject(example) ? _.omit(example, SKIP_KEY) : example;
  return `* ${quoteOrNa(
    // GH parses the newlines in bullets correctly, but it's a good thing to fix
    // docs say Infinity for no line break at all
    util.inspect(ex, { depth: null, breakLength: Infinity })
  )}`;
};

// Generate a display of the type (or link to a $ref).
const typeOrLink = schema => {
  if (schema.type === 'array' && schema.items) {
    return `${quoteOrNa(schema.type)}[${typeOrLink(schema.items)}]`;
  }
  if (schema.$ref) {
    return `[${schema.$ref}](${links.anchor(schema.$ref)})`;
  }
  for (let i = 0; i < COMBOS.length; i++) {
    const key = COMBOS[i];
    if (schema[key] && schema[key].length) {
      return `${key}(${schema[key].map(typeOrLink).join(', ')})`;
    }
  }
  if (schema.enum && schema.enum.length) {
    return `${quoteOrNa(schema.type)} in (${schema.enum
      .map(util.inspect)
      .map(quoteOrNa)
      .join(', ')})`;
  }
  return quoteOrNa(schema.type);
};

// Properly quote and display examples.
const makeExampleSection = Schema => {
  const examples = Schema.schema.examples || [];
  if (!examples.length) {
    return '';
  }
  return `\
#### Examples

${examples.map(formatExample).join('\n')}
`;
};

// Properly quote and display anti-examples.
const makeAntiExampleSection = Schema => {
  const examples = Schema.schema.antiExamples || [];
  if (!examples.length) {
    return '';
  }
  return `\
#### Anti-Examples

${examples.map(formatExample).join('\n')}
`;
};

const processProperty = (key, property, propIsRequired) => {
  let isRequired = propIsRequired ? '**yes**' : 'no';
  if (_.get(property, 'docAnnotation.required')) {
    // can also support keys besides "required"
    const annotation = property.docAnnotation.required;
    if (annotation.type === 'replace') {
      isRequired = annotation.value;
    } else if (annotation.type === 'append') {
      isRequired += annotation.value;
    } else {
      throw new Error(`unrecognized docAnnotation type: ${annotation.type}`);
    }
  }
  return `${quoteOrNa(key)} | ${isRequired} | ${typeOrLink(
    property
  )} | ${property.description || NO_DESCRIPTION}`;
};

// Enumerate the properties as a table.
const makePropertiesSection = Schema => {
  const properties =
    Schema.schema.properties || Schema.schema.patternProperties || {};
  if (!Object.keys(properties).length) {
    return '';
  }
  const required = Schema.schema.required || [];
  return `\
#### Properties

Key | Required | Type | Description
--- | -------- | ---- | -----------
${Object.keys(properties)
    .map(key => {
      const property = properties[key];
      return processProperty(key, property, required.includes(key));
    })
    .join('\n')}
`;
};

// Given a "root" schema, create some markdown.
const makeMarkdownSection = Schema => {
  return `\
## ${Schema.id}

${Schema.schema.description || NO_DESCRIPTION}

#### Details

* **Type** - ${typeOrLink(Schema.schema)}
* **Pattern** - ${quoteOrNa(Schema.schema.pattern)}
* **Source Code** - [lib/schemas${Schema.id}.js](${links.makeCodeLink(
    Schema.id
  )})

${makeExampleSection(Schema)}
${makeAntiExampleSection(Schema)}
${makePropertiesSection(Schema)}
`.trim();
};

// Generate the final markdown.
const buildDocs = InitSchema => {
  const schemas = collectSchemas(InitSchema);
  const markdownSections = _.chain(schemas)
    .values()
    .sortBy('id')
    .map(makeMarkdownSection)
    .join('\n\n-----\n\n');
  const docs = `\
<!-- {% raw %} -->
# \`zapier-platform-schema\` Generated Documentation

This is automatically generated by the \`npm run docs\` command in \`zapier-platform-schema\` version ${quoteOrNa(
    packageJson.version
  )}.

-----

## Index
<!-- toc -->

-----

${markdownSections}
<!-- {% endraw %} -->
`.trim();
  return toc.insert(docs, { maxdepth: 2, bullets: '*' });
};

module.exports = buildDocs;