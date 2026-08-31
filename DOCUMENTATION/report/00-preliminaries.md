<!-- Preliminary pages, in the order the department template requires:
     Cover, Title, Declaration, Certification, Dedication, Acknowledgements,
     Abstract, Table of Contents, List of Figures, List of Tables,
     List of Abbreviations, List of Appendices.

     Raw LaTeX is written in explicit ```{=latex} blocks. A bare \begin{...}
     inside a fenced div is silently dropped by Pandoc, which cost one build
     cycle already.

     The Table of Contents, List of Figures and List of Tables are emitted
     HERE rather than via --toc/--lof/--lot, because Pandoc pins those
     immediately after the title block, which put them ahead of the
     declaration and certification pages. -->

```{=latex}
\thispagestyle{empty}
\begin{center}

{\Large\bfseries DAR ES SALAAM INSTITUTE OF TECHNOLOGY}

\vspace{6mm}
{\large DEPARTMENT OF COMPUTER STUDIES}

\vspace{4mm}
{\large NTA LEVEL 8}

\vspace{16mm}
% O3: replace with the institute logo once the image file is supplied.
\framebox[45mm][c]{\rule{0pt}{28mm}\textsf{[INSTITUTE LOGO]}}

\vspace{16mm}
{\Large\bfseries BLOCKCHAIN-BASED NGO DONATION MANAGEMENT SYSTEM}

\vspace{16mm}
\begin{tabular}{ll}
\textbf{MODULE NAME:} & PROJECT REALIZATION \\[2mm]
\textbf{MODULE CODE:} & COU 08204 \\[2mm]
\textbf{COURSE:} & BENG22COE \\[2mm]
\textbf{CANDIDATE NAME:} & NASIBU Y. ISAKA \\[2mm]
\textbf{REGISTRATION NUMBER:} & 2106307225519 \\[2mm]
\textbf{SUPERVISOR'S NAME:} & DR GUSTAPH SANGA \\
\end{tabular}

\vfill
{\large [PENDING: SUBMISSION DATE]}

\end{center}
\clearpage

\thispagestyle{empty}
\begin{center}

{\Large\bfseries BLOCKCHAIN-BASED NGO DONATION MANAGEMENT SYSTEM}

\vspace{4mm}
{\large\itshape Changia}

\vspace{20mm}
{\large NASIBU Y. ISAKA}

\vspace{3mm}
{\large 2106307225519}

\vspace{25mm}
\begin{minipage}{0.8\textwidth}
\centering
A project report submitted in partial fulfilment of the requirements for the
award of NTA Level 8 in the Department of Computer Studies of the Dar es Salaam
Institute of Technology.
\end{minipage}

\vfill
{\large DAR ES SALAAM INSTITUTE OF TECHNOLOGY}

\vspace{2mm}
{\large [PENDING: SUBMISSION DATE]}

\end{center}
\clearpage

% Preliminary pages take roman numerals. \frontmatter is book-class only and
% this report uses the report class, so numbering is switched explicitly.
\pagenumbering{roman}
```

# Declaration {-}

I, **Nasibu Y. Isaka**, registration number **2106307225519**, declare that this
report is my own original work and that it has not been presented, and will not
be presented, to any other institution for a similar or any other award.

```{=latex}
\vspace{20mm}
Signature: \rule{55mm}{0.4pt} \hfill Date: \rule{40mm}{0.4pt}
\clearpage
```

# Certification {-}

The undersigned certifies that he has read and hereby recommends for acceptance
by the Dar es Salaam Institute of Technology a project report titled
**Blockchain-Based NGO Donation Management System**, submitted in partial
fulfilment of the requirements for the award of NTA Level 8 in the Department of
Computer Studies.

```{=latex}
\vspace{20mm}
\noindent\textbf{Dr Gustaph Sanga}\\
\textit{Supervisor}

\vspace{12mm}
\noindent Signature: \rule{55mm}{0.4pt} \hfill Date: \rule{40mm}{0.4pt}
\clearpage
```

# Dedication {-}

<!-- Personal. The candidate writes this. -->

```{=latex}
\clearpage
```

# Acknowledgements {-}

<!-- Personal. The candidate writes this. Conventionally: supervisor,
     department, family, and the respondents who completed the questionnaire. -->

```{=latex}
\clearpage
```

# Abstract {-}

<!-- Write LAST, once every chapter is settled. One paragraph, roughly 250 to
     300 words: problem, aim, method, what was built, key results,
     conclusion. No citations in an abstract. -->

```{=latex}
\clearpage

\tableofcontents
\clearpage

% \addcontentsline so the figure and table lists appear in the contents
% themselves. \listoffigures does not add itself.
\addcontentsline{toc}{chapter}{List of Figures}
\listoffigures
\clearpage

\addcontentsline{toc}{chapter}{List of Tables}
\listoftables
\clearpage
```

# List of Abbreviations {-}

| Abbreviation | Meaning |
|--------------|---------------------------------------|
| API | Application Programming Interface |
| CSV | Comma Separated Values |
| DFD | Data Flow Diagram |
| DIT | Dar es Salaam Institute of Technology |
| ERD | Entity Relationship Diagram |
| FR | Functional Requirement |
| JWT | JSON Web Token |
| NFR | Non-functional Requirement |
| NGO | Non-Governmental Organization |
| NTA | National Technical Award |
| ORM | Object Relational Mapping |
| RBAC | Role Based Access Control |
| RPC | Remote Procedure Call |
| SDLC | Software Development Life Cycle |
| SRS | Software Requirement Specification |
| TZS | Tanzanian Shilling |
| UAT | User Acceptance Testing |
| UML | Unified Modeling Language |

```{=latex}
\clearpage
```

# List of Appendices {-}

| Appendix | Title |
|----------|------------------------------------|
| A | Questionnaire |
| B | Document Review Matrix |
| C | Source Code (selected excerpts) |
| D | User Manual |
| E | Installation Guide |
| F | Test Cases |
| G | Gantt Chart |
| H | Budget |
| I | Additional Screenshots |
| J | Full Entity Relationship Diagram |

```{=latex}
\clearpage

% Chapter One restarts at arabic 1.
\pagenumbering{arabic}
\setcounter{page}{1}
```
