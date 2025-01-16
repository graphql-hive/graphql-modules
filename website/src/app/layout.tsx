import { FC, ReactNode } from 'react';
import {
  GitHubIcon,
  HiveFooter,
  PaperIcon,
  PencilIcon,
  PRODUCTS,
  ModulesLogo,
} from '@theguild/components';
import {
  getDefaultMetadata,
  getPageMap,
  GuildLayout,
} from '@theguild/components/server';
import '@theguild/components/style.css';

const description = PRODUCTS.SCALARS.title;
const websiteName = 'GraphQL Scalars';

export const metadata = getDefaultMetadata({
  description,
  websiteName,
  productName: 'SCALARS',
});

const RootLayout: FC<{
  children: ReactNode;
}> = async ({ children }) => {
  const logo = <ModulesLogo fill="currentColor" className="h-auto w-8" />;
  return (
    <GuildLayout
      websiteName={websiteName}
      description={description}
      logo={logo}
      layoutProps={{
        docsRepositoryBase:
          'https://github.com/Urigo/graphql-modules/tree/master/website',
        footer: (
          <HiveFooter
            logo={
              <div className="flex items-center gap-3">
                {logo}
                <span className="text-2xl/[1.2] font-medium tracking-[-0.16px]">
                  {websiteName}
                </span>
              </div>
            }
            description={description}
            items={{
              resources: [
                {
                  children: 'Changelog',
                  href: '/changelog',
                  title: 'Changelog',
                },
              ],
            }}
          />
        ),
      }}
      pageMap={await getPageMap()}
      navbarProps={{
        navLinks: [{ href: '/changelog', children: 'Changelog' }],
        developerMenu: [
          {
            href: '/docs',
            icon: <PaperIcon />,
            children: 'Documentation',
          },
          {
            href: 'https://the-guild.dev/blog',
            icon: <PencilIcon />,
            children: 'Blog',
          },
          {
            href: 'https://github.com/Urigo/graphql-modules',
            icon: <GitHubIcon />,
            children: 'GitHub',
          },
        ],
      }}
      lightOnlyPages={['/']}
    >
      {children}
    </GuildLayout>
  );
};

export default RootLayout;
