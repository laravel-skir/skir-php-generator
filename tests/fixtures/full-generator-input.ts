import type {
  PhpGeneratorInput,
  SkirRecordLocation,
} from "../../src/generator.js";

const addressRecord = {
  kind: "record",
  key: "address-key",
  name: { text: "Address" },
  recordType: "struct" as const,
  fields: [
    {
      kind: "field" as const,
      name: { text: "city" },
      number: 0,
      type: { kind: "primitive", primitive: "string" },
    },
    {
      kind: "field" as const,
      name: { text: "postal_codes" },
      number: 1,
      type: {
        kind: "array",
        item: { kind: "primitive", primitive: "string" },
      },
    },
  ],
};

const userRecord = {
  kind: "record",
  key: "admin-user-key",
  name: { text: "User" },
  recordType: "struct" as const,
  fields: [
    {
      kind: "field" as const,
      name: { text: "user_id" },
      number: 0,
      type: { kind: "primitive", primitive: "int32" },
    },
    {
      kind: "field" as const,
      name: { text: "address" },
      number: 2,
      type: {
        kind: "record",
        key: "address-key",
        recordType: "struct" as const,
        nameParts: [{ token: { text: "Address" } }],
      },
    },
    {
      kind: "field" as const,
      name: { text: "previous_addresses" },
      number: 3,
      type: {
        kind: "array",
        item: {
          kind: "record",
          key: "address-key",
          recordType: "struct" as const,
          nameParts: [{ token: { text: "Address" } }],
        },
      },
    },
    {
      kind: "field" as const,
      name: { text: "nickname" },
      number: 4,
      type: {
        kind: "optional",
        other: { kind: "primitive", primitive: "string" },
      },
    },
    {
      kind: "field" as const,
      name: { text: "matrix" },
      number: 5,
      type: {
        kind: "array",
        item: {
          kind: "array",
          item: { kind: "primitive", primitive: "int32" },
        },
      },
    },
  ],
  removedNumbers: [1],
};

const subscriptionStatusRecord = {
  kind: "record",
  key: "subscription-status-key",
  name: { text: "SubscriptionStatus" },
  recordType: "enum" as const,
  fields: [
    {
      kind: "field" as const,
      name: { text: "free" },
      number: 0,
    },
    {
      kind: "field" as const,
      name: { text: "premium_since" },
      number: 1,
      type: { kind: "primitive", primitive: "timestamp" },
    },
  ],
};

const addressLocation = {
  kind: "record-location" as const,
  record: addressRecord,
  recordAncestors: [addressRecord],
  modulePath: "common/address.skir",
};

const userLocation = {
  kind: "record-location" as const,
  record: userRecord,
  recordAncestors: [userRecord],
  modulePath: "admin/users.skir",
};

const subscriptionStatusLocation = {
  kind: "record-location" as const,
  record: subscriptionStatusRecord,
  recordAncestors: [subscriptionStatusRecord],
  modulePath: "admin/users.skir",
};

const userReference = {
  kind: "record",
  key: "admin-user-key",
  recordType: "struct" as const,
  nameParts: [{ token: { text: "User" } }],
};

export const fullGeneratorInput: PhpGeneratorInput = {
  config: {
    namespace: "Skir",
  },
  modules: [
    {
      path: "common/address.skir",
      records: [addressLocation],
    },
    {
      path: "admin/users.skir",
      records: [userLocation, subscriptionStatusLocation],
      methods: [
        {
          kind: "method",
          name: { text: "GetUser" },
          number: 1,
          requestType: userReference,
          responseType: userReference,
        },
        {
          kind: "method",
          name: { text: "FindUsers" },
          number: 2,
          requestType: {
            kind: "optional",
            other: { kind: "primitive", primitive: "string" },
          },
          responseType: {
            kind: "array",
            item: userReference,
          },
        },
      ],
    },
  ],
  recordMap: new Map<string, SkirRecordLocation>([
    ["address-key", addressLocation],
    ["admin-user-key", userLocation],
    ["subscription-status-key", subscriptionStatusLocation],
  ]),
};
