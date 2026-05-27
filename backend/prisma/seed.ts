import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const permissions = [
  'organization:read',
  'organization:update',
  'organization:delete',
  'team:invite',
  'team:remove',
  'team:update_role',
  'billing:read',
  'billing:manage',
  'project:create',
  'project:read',
  'project:update',
  'project:delete',
  'project:env:manage',
  'deployment:create',
  'deployment:read',
  'deployment:cancel',
  'deployment:rollback',
  'domain:create',
  'domain:read',
  'domain:update',
  'domain:delete',
  'dns:manage',
  'ssl:manage',
  'builder:create',
  'builder:read',
  'builder:update',
  'builder:publish',
  'builder:delete',
  'asset:create',
  'asset:read',
  'asset:delete',
  'analytics:read',
  'activity:read',
  'audit:read',
  'webhook:manage',
  'api_key:manage',
  'admin:access'
] as const;

const rolePermissionKeys: Record<string, readonly string[]> = {
  owner: permissions,
  admin: permissions.filter((key) => key !== 'admin:access' && key !== 'organization:delete'),
  developer: [
    'organization:read',
    'project:create',
    'project:read',
    'project:update',
    'project:env:manage',
    'deployment:create',
    'deployment:read',
    'deployment:cancel',
    'deployment:rollback',
    'domain:read',
    'dns:manage',
    'ssl:manage',
    'asset:create',
    'asset:read',
    'asset:delete',
    'analytics:read',
    'activity:read'
  ],
  designer: [
    'organization:read',
    'project:read',
    'builder:create',
    'builder:read',
    'builder:update',
    'builder:publish',
    'builder:delete',
    'asset:create',
    'asset:read',
    'asset:delete',
    'analytics:read',
    'activity:read'
  ],
  billing_manager: [
    'organization:read',
    'billing:read',
    'billing:manage',
    'activity:read'
  ],
  viewer: [
    'organization:read',
    'billing:read',
    'project:read',
    'deployment:read',
    'domain:read',
    'builder:read',
    'asset:read',
    'analytics:read',
    'activity:read'
  ]
};

const roleNames: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  developer: 'Developer',
  designer: 'Designer',
  billing_manager: 'Billing Manager',
  viewer: 'Viewer'
};

const billingPlans = [
  {
    key: 'free',
    name: 'Free',
    description: 'For hobbyists and side projects',
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    isActive: true,
    limits: {
      projects: 3,
      teamMembers: 1,
      deploymentsPerMonth: 100,
      buildMinutesPerMonth: 300,
      bandwidthGbPerMonth: 10,
      storageMb: 500,
      domains: 1,
      customDomains: 0
    },
    features: {
      customDomains: false,
      sslCertificates: false,
      analytics: 'basic',
      webhooks: false,
      apiAccess: false,
      prioritySupport: false
    }
  },
  {
    key: 'pro',
    name: 'Pro',
    description: 'For professionals and small teams',
    priceMonthlyCents: 1900,
    priceYearlyCents: 19000,
    isActive: true,
    limits: {
      projects: 20,
      teamMembers: 5,
      deploymentsPerMonth: 500,
      buildMinutesPerMonth: 2000,
      bandwidthGbPerMonth: 100,
      storageMb: 10000,
      domains: 10,
      customDomains: 10
    },
    features: {
      customDomains: true,
      sslCertificates: true,
      analytics: 'advanced',
      webhooks: true,
      apiAccess: true,
      prioritySupport: false
    }
  },
  {
    key: 'team',
    name: 'Team',
    description: 'For growing teams and agencies',
    priceMonthlyCents: 4900,
    priceYearlyCents: 49000,
    isActive: true,
    limits: {
      projects: -1,
      teamMembers: -1,
      deploymentsPerMonth: -1,
      buildMinutesPerMonth: 10000,
      bandwidthGbPerMonth: 1000,
      storageMb: 100000,
      domains: -1,
      customDomains: -1
    },
    features: {
      customDomains: true,
      sslCertificates: true,
      analytics: 'advanced',
      webhooks: true,
      apiAccess: true,
      prioritySupport: true,
      auditLogs: true,
      ssoSaml: false
    }
  }
];

const templateSeeds = [
  { name: 'Portfolio',      category: 'Portfolio',    sortOrder: 1,  contentJson: { motif: 'monogram',  accent: '#1a1f1d', surface: '#f9f7f4', tagline: 'Show your work. Land the client.'           } },
  { name: 'Small Business', category: 'Business',     sortOrder: 2,  contentJson: { motif: 'stripes',   accent: '#1d4e6e', surface: '#f0f4f7', tagline: 'From quote to booking in minutes.'          } },
  { name: 'Restaurant',     category: 'Food & Drink', sortOrder: 3,  contentJson: { motif: 'menu',      accent: '#7c2d12', surface: '#fdf6ee', tagline: 'A menu worth sitting down for.'             } },
  { name: 'Photography',    category: 'Creative',     sortOrder: 4,  contentJson: { motif: 'grid',      accent: '#1a1f1d', surface: '#0a0a0a', tagline: 'Full-bleed images, nothing in the way.'    } },
  { name: 'Agency',         category: 'Business',     sortOrder: 5,  contentJson: { motif: 'blocks',    accent: '#2a4d9a', surface: '#f4f6fb', tagline: 'Case studies that close deals.'             } },
  { name: 'Blog',           category: 'Publishing',   sortOrder: 6,  contentJson: { motif: 'lines',     accent: '#198754', surface: '#fafafa', tagline: 'Long-form writing with room to breathe.'   } },
  { name: 'SaaS',           category: 'Technology',   sortOrder: 7,  contentJson: { motif: 'gradient',  accent: '#6d28d9', surface: '#0f0f14', tagline: 'Hero, features, pricing. Ship it.'         } },
  { name: 'Event',          category: 'Events',       sortOrder: 8,  contentJson: { motif: 'spotlight', accent: '#c2410c', surface: '#09090b', tagline: 'Build anticipation, sell the night.'        } },
  { name: 'Nonprofit',      category: 'Community',    sortOrder: 9,  contentJson: { motif: 'leaf',      accent: '#065f46', surface: '#f0faf6', tagline: 'Mission first. Donations follow.'          } },
];

async function main() {
  // Seed billing plans
  for (const plan of billingPlans) {
    await prisma.billingPlan.upsert({
      where: { key: plan.key },
      update: {
        name: plan.name,
        description: plan.description,
        priceMonthlyCents: plan.priceMonthlyCents,
        priceYearlyCents: plan.priceYearlyCents,
        isActive: plan.isActive,
        limits: plan.limits,
        features: plan.features
      },
      create: {
        key: plan.key,
        name: plan.name,
        description: plan.description,
        priceMonthlyCents: plan.priceMonthlyCents,
        priceYearlyCents: plan.priceYearlyCents,
        isActive: plan.isActive,
        limits: plan.limits,
        features: plan.features
      }
    });
  }

  await Promise.all(
    permissions.map((key) =>
      prisma.permission.upsert({
        where: { key },
        update: {},
        create: {
          key,
          name: toTitle(key),
          module: key.split(':')[0],
          description: `Allows ${key.replace(':', ' ')} actions.`
        }
      })
    )
  );

  for (const [key, name] of Object.entries(roleNames)) {
    const existingRole = await prisma.role.findFirst({
      where: {
        organizationId: null,
        key,
        isSystem: true
      }
    });

    const role = existingRole
      ? await prisma.role.update({
          where: { id: existingRole.id },
          data: {
            name,
            isSystem: true
          }
        })
      : await prisma.role.create({
          data: {
            key,
            name,
            isSystem: true
          }
        });

    const grants = rolePermissionKeys[key] ?? [];
    for (const permissionKey of grants) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { key: permissionKey }
      });

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id
          }
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id
        }
      });
    }
  }

  // Seed templates (only if table is empty — idempotent)
  const templateCount = await prisma.template.count();
  if (templateCount === 0) {
    await prisma.template.createMany({
      data: templateSeeds.map((template) => ({
        ...template,
        contentJson: template.contentJson
      }))
    });
    console.log(`Seeded ${templateSeeds.length} templates.`);
  } else {
    console.log(`Templates already seeded (${templateCount} rows), skipping.`);
  }

  // Seed default pricing rules
  const pricingRules = [
    { scope: 'vps_markup',    key: 'default', value: '20', currency: 'USD' },
    { scope: 'domain_markup', key: 'default', value: '15', currency: 'USD' },
  ];
  for (const rule of pricingRules) {
    await prisma.pricingRule.upsert({
      where: { scope_key: { scope: rule.scope, key: rule.key } },
      update: { value: rule.value, isActive: true },
      create: { scope: rule.scope, key: rule.key, value: rule.value, currency: rule.currency, isActive: true }
    });
  }
  console.log('Seeded default pricing rules.');
}

function toTitle(key: string) {
  return key
    .split(':')
    .map((part) => part.replace(/_/g, ' '))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
