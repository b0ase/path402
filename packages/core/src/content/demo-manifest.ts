/**
 * Demo Content Manifest
 *
 * Maps bundled demo videos to token IDs so new users
 * can test the content store immediately on first run.
 */

export interface DemoItem {
  filename: string;
  tokenId: string;
  name: string;
  contentType: string;
  hash: string;
  size: number;
}

export const DEMO_MANIFEST: DemoItem[] = [
  {
    filename: 'fucker_carlsberg.mp4',
    tokenId: 'demo:fucker-carlsberg',
    name: 'Fucker Carlsberg',
    contentType: 'video/mp4',
    hash: 'b93f9db32ade2c847a2069cb91264a93fe918cd2c7e5ceea762a9367aa98ceff',
    size: 1303923
  },
  {
    filename: 'alex_bones.mp4',
    tokenId: 'demo:alex-bones',
    name: 'Alex Bones',
    contentType: 'video/mp4',
    hash: '71a7ec394a75661e41ea35a7a39646d33e2dc7c767ef4d0e6159b0edf35d6965',
    size: 4628925
  },
  {
    filename: 'michael-fayloor.mp4',
    tokenId: 'demo:michael-fayloor',
    name: 'Michael Fayloor',
    contentType: 'video/mp4',
    hash: '1bf879cc8fd4770f3d8b1ba1f651da9bf113702d2545d96004a09469f26d4898',
    size: 3828812
  },
  {
    filename: 'candy_hoens.mp4',
    tokenId: 'demo:candy-hoens',
    name: 'Candy Hoens',
    contentType: 'video/mp4',
    hash: 'feacf86205324e3964eba115c6c866d0af234980d6f30553f154493889258a94',
    size: 3080632
  },
  {
    filename: 'charlie_smirk.mp4',
    tokenId: 'demo:charlie-smirk',
    name: 'Charlie Smirk',
    contentType: 'video/mp4',
    hash: '453a56f489ab2a41a36f5a97de8a04426910112aba97897423b25dafb6506d82',
    size: 1141262
  },
  {
    filename: 'dick_fluenza.mp4',
    tokenId: 'demo:dick-fluenza',
    name: 'Dick Fluenza',
    contentType: 'video/mp4',
    hash: 'cf0d8b5c6193b2e7956b5f0b3e0f72fbcb1477353223d0e6d2780d130c231122',
    size: 2654651
  }
];
