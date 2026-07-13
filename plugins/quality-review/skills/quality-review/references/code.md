# Lens sheet: code

One section per lens. Each section is the finder's hunting procedure, not a definition. This sheet audits the communication half of code: what a reader experiences. Correctness, safety, and performance belong to /code-review, not here.

### unity
Collect the conventions in the target (naming, error handling, module layout, test style). Flag code that does the same thing a second way, and names that break the scheme their siblings follow.

### vividness
Check that names build the right mental model: a reader should predict what a function does from its name and be right. Flag names that mislead, encode nothing, or require reading the body to understand.

### authority
For every invariant stated in a comment or doc-comment, check whether a type, assertion, or test enforces it. Flag invariants that exist only as prose, and confident comments the code does not back.

### economy
Find code that re-implements something the codebase already has, abstractions with one caller, and state that is derivable from other state. Name the existing helper or the simpler form.

### sensitivity
Read the public surface as its consumer. Flag APIs whose ergonomics force awkward call sites, error messages that do not help the person debugging, and parameter lists a caller cannot fill without reading the implementation.

### clarity
Read each function top to bottom once. Flag control flow you had to simulate to follow, expressions that need mental parsing, and cleverness that trades a reread for a line.

### emphasis
Check that the main path of each module is prominent. Flag core logic buried under boilerplate, the interesting line hidden in noise, and public entry points that do not stand out from helpers.

### flow
Check reading order. Flag definitions far from their use, files that read bottom-up, and modules a reader must ping-pong across to follow one operation.

### suspense
Inverted: the principle of least astonishment. Flag behavior a reader would not predict from the code in front of them: spooky action at a distance, side effects in predicates, state set far from where it is read.

### brilliance
Locate the design-level ideas. Flag novel mechanisms that live only in the code with no comment or doc pointing at them, and cleverness in the lines where boring code would do.

### precision
Check that each function does what its name says, all of it, and only it. Flag names narrower or broader than the behavior, and doc-comments that describe a previous version.

### proportion
Compare module and function sizes to their responsibility. Flag god files, one-line wrappers that only forward, and abstraction depth the problem does not need.

### depth
At every non-obvious choice, look for the captured why: a comment stating the constraint, a commit message, a design note. Flag choices that clearly had reasons the code does not record.

## Calibration

- House idioms and project-owned names are exempt; the scope agent's conventions block lists them.
- Generated code, vendored code, and archived code are exempt.
- Do not flag correctness bugs here even when you see them; note them separately for a /code-review pass so the lanes stay distinct.
- Proposed fixes must match the file's existing style (the comment density and naming of the surrounding code), per the conventions the scope agent collected.
