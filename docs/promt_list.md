OUTPUT FORMAT
------------------------------
route: <HTTP VERB> <PATH>    # e.g., POST /api/signup
scope: api|fn|migration      # one only
dependencies:                # other chips this relies on (IDs only)
  - 1.1
  - 1.2
  
request:
  headers:
    required: [x-request-id, x-tenant-id]
  body:                       # schema $id references only
    $ref: "schema://<Body>@1"

responses:
  200:
    description: "Success case"
    body: {orgId: string}
  400:
    description: "Validation error"
  409:
    description: "Conflict (e.g., duplicate)"

sideEffects:
  - Creates Organization record in DB
  - Updates Stripe customer

tests:
  unit:
    - description: "Happy path returns 200"
      expect: "Response contains expected data"
    - description: "Missing required field returns 400"
      expect: "Error message indicates missing field"
    - description: "Duplicate resource returns 409"
      expect: "Conflict error returned"

documentation:
  onCompletion:
    - Update /features/1_signup_trial/story_features.md
      # Format: filename + method name + short description
    - If final story in group: Update /features/story_global.md
      # Format: /api/route at highest level only

filesAllowed:                # strict whitelist for this story
  - /features/1_signup_trial/1.1_org_create/**
  - /features/1_signup_trial/story_features.md  # Read for references, update on completion
  - /features/story_global.md                   # Read for cross-story references
  - /lib/scaffold/**
  - /prisma/schema.prisma    # Use existing structure. If not possible, APPEND ONLY - no deletions or modifications
  - /.env

notes:
  - Additional context or constraints
  - Dependencies on external services














Let's create a short text file called story_feature.md.  scaffold is the untility functions that the application cna use.  So each story has an API and each API is independent and it can use the scaffold utility.  So read the files until the /lib/scaffold folder and create a tiny _class_map.md file which lists function name and what it does in short description. Remember that I only want a reference so that AI can look it up for detail.  I do not want details in the map file.  It will be too large for AI.  So 
remember to keep it short.  filename, method name and what it does. 
